import type {
  EditDecisionList,
  CutOperation,
  SpeedOperation,
  SilenceRemoveOperation,
  ReframeOperation,
  TrimOperation,
  CaptionOperation,
  IllustrationOperation,
} from "@/types/edl";
import { getEncoderArgs, detectBestEncoder } from "./hwaccel";

/**
 * Build atempo filter chain for a given speed factor.
 * atempo only supports 0.5-2.0, so chain multiple for extremes.
 */
function buildAtempoChain(factor: number): string {
  const filters: string[] = [];
  let remaining = factor;

  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }

  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(",");
}

/**
 * Build crop filter for reframing to a target aspect ratio.
 * Uses center-crop (no face detection).
 */
function buildCropFilter(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: string
): string {
  const ratios: Record<string, number> = {
    "9:16": 9 / 16,
    "1:1": 1,
    "4:5": 4 / 5,
  };

  const ratio = ratios[targetRatio] ?? 9 / 16;
  const targetWidth = Math.round(sourceHeight * ratio);

  if (targetWidth <= sourceWidth) {
    const x = Math.round((sourceWidth - targetWidth) / 2);
    return `crop=${targetWidth}:${sourceHeight}:${x}:0`;
  } else {
    const targetHeight = Math.round(sourceWidth / ratio);
    const y = Math.round((sourceHeight - targetHeight) / 2);
    return `crop=${sourceWidth}:${targetHeight}:0:${y}`;
  }
}

function buildScaleFilter(targetRatio: string): string {
  switch (targetRatio) {
    case "9:16":
      return "scale=1080:1920";
    case "1:1":
      return "scale=1080:1080";
    case "4:5":
      return "scale=1080:1350";
    default:
      return "scale=1080:1920";
  }
}

/**
 * Escape a file path for FFmpeg filter arguments on Windows/Linux.
 */
function escapeFilterPath(filePath: string): string {
  // Convert backslashes to forward slashes
  let escaped = filePath.replace(/\\/g, "/");
  // Escape colons (drive letters on Windows like C:)
  escaped = escaped.replace(/:/g, "\\:");
  return escaped;
}

/**
 * Convert an EDL into FFmpeg arguments.
 *
 * Key insight: when -ss is used for trim, FFmpeg resets timestamps to 0.
 * So subtitle files must have timestamps relative to the trimmed start.
 * The caller (render.ts) handles generating subtitles with the correct offset.
 */
interface EdlMeta {
  silences?: Array<{ start: number; end: number }>;
  fillerWordTimestamps?: Array<{ start: number; end: number; word: string }>;
  [key: string]: unknown;
}

export function buildFFmpegArgs(
  inputPath: string,
  outputPath: string,
  edl: EditDecisionList & { _meta?: EdlMeta },
  subtitlePath?: string,
  disabledOps?: Set<number>
): { args: string[]; trimStart: number; trimEnd: number; speedFactor: number } {
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];
  const disabled = disabledOps ?? new Set();

  console.log(`[ffmpeg:build] Total operations: ${edl.operations.length}`);
  console.log(`[ffmpeg:build] Disabled indices:`, [...disabled]);
  console.log(`[ffmpeg:build] Subtitle path: ${subtitlePath ?? "NONE"}`);

  let hasTrim = false;
  let trimStart = 0;
  let trimEnd = edl.sourceVideo.duration;
  let speedFactor = 1;

  // Collect segments to remove
  const cutsToRemove: Array<{ start: number; end: number }> = [];

  // First pass: collect trim and speed info
  for (let i = 0; i < edl.operations.length; i++) {
    if (disabled.has(i)) {
      console.log(`[ffmpeg:build] Op ${i} (${edl.operations[i].type}): SKIPPED (disabled)`);
      continue;
    }
    const op = edl.operations[i];

    if (op.type === "trim") {
      const trimOp = op as TrimOperation;
      hasTrim = true;
      trimStart = trimOp.startTime;
      trimEnd = trimOp.endTime;
    }

    if (op.type === "speed") {
      const speedOp = op as SpeedOperation;
      if (speedOp.segments.length > 0) {
        speedFactor = speedOp.segments[0].factor;
      }
    }
  }

  // Track which "global" op types we've already applied — the model sometimes
  // emits duplicate speed/caption/reframe/silence_remove ops, and stacking the
  // filters wrecks the timeline (e.g. setpts=0.8*PTS x12 yields zero frames).
  const applied = { speed: false, caption: false, reframe: false, silence_remove: false };

  // Second pass: build filters
  for (let i = 0; i < edl.operations.length; i++) {
    if (disabled.has(i)) continue;
    const op = edl.operations[i];

    console.log(`[ffmpeg:build] Processing op ${i}: type="${op.type}"`);

    switch (op.type) {
      case "cut": {
        const cutOp = op as CutOperation;
        console.log(`[ffmpeg:build]   cut: ${cutOp.segments.length} segments to remove`);
        for (const seg of cutOp.segments) {
          console.log(`[ffmpeg:build]   cut segment: ${seg.startTime.toFixed(3)} - ${seg.endTime.toFixed(3)}`);
          cutsToRemove.push({ start: seg.startTime, end: seg.endTime });
        }
        break;
      }

      case "speed": {
        if (applied.speed) {
          console.log(`[ffmpeg:build]   speed: SKIPPED (already applied, factor=${speedFactor})`);
          break;
        }
        console.log(`[ffmpeg:build]   speed factor: ${speedFactor}`);
        if (speedFactor !== 1) {
          const vf = `setpts=${(1 / speedFactor).toFixed(4)}*PTS`;
          const af = buildAtempoChain(speedFactor);
          console.log(`[ffmpeg:build]   speed video filter: ${vf}`);
          console.log(`[ffmpeg:build]   speed audio filter: ${af}`);
          videoFilters.push(vf);
          audioFilters.push(af);
        } else {
          console.log(`[ffmpeg:build]   speed is 1.0, no filter added`);
        }
        applied.speed = true;
        break;
      }

      case "caption": {
        if (applied.caption) {
          console.log(`[ffmpeg:build]   caption: SKIPPED (already applied)`);
          break;
        }
        console.log(`[ffmpeg:build]   caption: subtitlePath=${subtitlePath ?? "NONE"}`);
        if (subtitlePath) {
          const escapedPath = escapeFilterPath(subtitlePath);
          const filter = `subtitles=${escapedPath}`;
          console.log(`[ffmpeg:build]   caption filter: ${filter}`);
          videoFilters.push(filter);
          applied.caption = true;
        } else {
          console.log(`[ffmpeg:build]   WARNING: caption op found but no subtitle file!`);
        }
        break;
      }

      case "reframe": {
        if (applied.reframe) {
          console.log(`[ffmpeg:build]   reframe: SKIPPED (already applied)`);
          break;
        }
        const reframeOp = op as ReframeOperation;
        const crop = buildCropFilter(
          edl.sourceVideo.width,
          edl.sourceVideo.height,
          reframeOp.targetAspectRatio
        );
        const scale = buildScaleFilter(reframeOp.targetAspectRatio);
        console.log(`[ffmpeg:build]   reframe: ${reframeOp.targetAspectRatio}, crop=${crop}, scale=${scale}`);
        videoFilters.push(crop);
        videoFilters.push(scale);
        applied.reframe = true;
        break;
      }

      case "illustration":
        // Illustrations are handled in a separate FFmpeg pass (overlay requires filter_complex)
        console.log(`[ffmpeg:build]   illustration: ${(op as IllustrationOperation).illustrations?.length ?? 0} overlays (handled in separate pass)`);
        break;

      case "transition":
        console.log(`[ffmpeg:build]   transition: NOT IMPLEMENTED (skipped)`);
        break;
      case "silence_remove": {
        if (applied.silence_remove) {
          console.log(`[ffmpeg:build]   silence_remove: SKIPPED (already applied)`);
          break;
        }
        applied.silence_remove = true;
        const silOp = op as SilenceRemoveOperation;
        const meta = edl._meta;
        const padding = silOp.padding ?? 0.15;

        // Remove silences longer than minSilenceDuration
        if (meta?.silences) {
          const minDur = silOp.minSilenceDuration ?? 0.5;
          const silenceCuts = meta.silences.filter((s) => (s.end - s.start) >= minDur);
          console.log(`[ffmpeg:build]   silence_remove: ${silenceCuts.length} silences >= ${minDur}s`);
          for (const s of silenceCuts) {
            // Keep padding on each side so cuts aren't jarring
            const cutStart = s.start + padding;
            const cutEnd = s.end - padding;
            if (cutEnd > cutStart) {
              console.log(`[ffmpeg:build]     removing silence: ${cutStart.toFixed(3)} - ${cutEnd.toFixed(3)}`);
              cutsToRemove.push({ start: cutStart, end: cutEnd });
            }
          }
        }

        // Remove filler words
        // NOTE: Filler words are short (0.2-0.5s). Do NOT apply padding to them,
        // or the padding eats the entire cut and nothing gets removed.
        if (silOp.removeFiller && meta?.fillerWordTimestamps) {
          const targetFillers = silOp.fillerWords?.length > 0
            ? meta.fillerWordTimestamps.filter((f) =>
                silOp.fillerWords.some((w) => f.word.toLowerCase().includes(w.toLowerCase()))
              )
            : meta.fillerWordTimestamps;

          console.log(`[ffmpeg:build]   silence_remove: ${targetFillers.length} filler words to remove`);
          for (const f of targetFillers) {
            // Use the exact word boundaries, no padding. The word itself IS the thing to cut.
            console.log(`[ffmpeg:build]     removing filler "${f.word}": ${f.start.toFixed(3)} - ${f.end.toFixed(3)}`);
            cutsToRemove.push({ start: f.start, end: f.end });
          }
        }

        // Also merge overlapping cuts to prevent filter issues
        if (cutsToRemove.length > 1) {
          cutsToRemove.sort((a, b) => a.start - b.start);
          const merged: Array<{ start: number; end: number }> = [cutsToRemove[0]];
          for (let ci = 1; ci < cutsToRemove.length; ci++) {
            const prev = merged[merged.length - 1];
            const curr = cutsToRemove[ci];
            if (curr.start <= prev.end + 0.05) {
              prev.end = Math.max(prev.end, curr.end);
            } else {
              merged.push(curr);
            }
          }
          cutsToRemove.length = 0;
          cutsToRemove.push(...merged);
          console.log(`[ffmpeg:build]   merged overlapping cuts: ${merged.length} segments`);
        }

        if (!meta?.silences && !meta?.fillerWordTimestamps) {
          console.log(`[ffmpeg:build]   WARNING: silence_remove op but no silence/filler data in _meta`);
        }
        break;
      }
      case "trim":
        console.log(`[ffmpeg:build]   trim: handled via -ss/-to (${trimStart.toFixed(3)} to ${trimEnd.toFixed(3)})`);
        break;
    }
  }

  console.log(`[ffmpeg:build] After processing: ${videoFilters.length} video filters, ${audioFilters.length} audio filters`);
  console.log(`[ffmpeg:build] Video filters:`, videoFilters);
  console.log(`[ffmpeg:build] Audio filters:`, audioFilters);

  // Build select/aselect for cuts (adjust for trim offset)
  if (cutsToRemove.length > 0) {
    const duration = trimEnd - trimStart;

    // Adjust timestamps: subtract trim offset, clamp to valid range, discard out-of-range cuts
    const adjustedCuts = cutsToRemove
      .map((c) => ({
        start: Math.max(0, c.start - trimStart),
        end: Math.min(duration, c.end - trimStart),
      }))
      .filter((c) => c.end > c.start && c.start < duration && c.end > 0);

    console.log(`[ffmpeg:build] Cuts after trim adjustment: ${adjustedCuts.length} (from ${cutsToRemove.length} original)`);

    if (adjustedCuts.length > 0) {
      const keeps: Array<{ start: number; end: number }> = [];
      let cursor = 0;
      for (const cut of adjustedCuts.sort((a, b) => a.start - b.start)) {
        if (cursor < cut.start) {
          keeps.push({ start: cursor, end: cut.start });
        }
        cursor = Math.max(cursor, cut.end);
      }
      if (cursor < duration) {
        keeps.push({ start: cursor, end: duration });
      }

      console.log(`[ffmpeg:build] Keep segments: ${keeps.length}`, keeps.map(k => `${k.start.toFixed(2)}-${k.end.toFixed(2)}`));

      // Only apply select filter if we're actually keeping some content
      // and removing some content (otherwise it's a no-op that risks breaking the stream)
      if (keeps.length > 0 && keeps.length < adjustedCuts.length + 2) {
        const keepExpr = keeps
          .map((k) => `between(t,${k.start.toFixed(3)},${k.end.toFixed(3)})`)
          .join("+");
        // Order matters: select drops frames leaving non-monotonic PTS, which
        // must be renumbered IMMEDIATELY (before speed/scale/subtitles). Putting
        // the renumber at the end causes every frame to be dropped by the muxer.
        videoFilters.unshift("setpts=N/FRAME_RATE/TB");
        videoFilters.unshift(`select='${keepExpr}'`);
        audioFilters.unshift("asetpts=N/SR/TB");
        audioFilters.unshift(`aselect='${keepExpr}'`);
      } else {
        console.log(`[ffmpeg:build] WARNING: Cuts would remove all content or nothing. Skipping select filter.`);
      }
    }
  }

  // ── Audio normalization (EBU R128, -14 LUFS for social media) ──
  const shouldNormalize = edl.normalizeAudio !== false; // default true
  if (shouldNormalize) {
    audioFilters.push("loudnorm=I=-14:TP=-1:LRA=11");
    console.log(`[ffmpeg:build] Audio normalization: loudnorm=I=-14:TP=-1:LRA=11`);
  } else {
    console.log(`[ffmpeg:build] Audio normalization: DISABLED by EDL`);
  }

  // ── Audio fades (prevent jarring cuts at trim points) ──
  const outputDuration = (trimEnd - trimStart) / (speedFactor || 1);
  if (outputDuration > 1.5) {
    audioFilters.push("afade=t=in:st=0:d=0.5");
    const fadeOutStart = Math.max(0, outputDuration - 0.5);
    audioFilters.push(`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.5`);
    console.log(`[ffmpeg:build] Audio fades: 0.5s in, 0.5s out (at ${fadeOutStart.toFixed(1)}s)`);
  }

  console.log(`[ffmpeg:build] Final: ${videoFilters.length} video filters, ${audioFilters.length} audio filters, hasTrim=${hasTrim}`);
  if (videoFilters.length === 0 && audioFilters.length === 0 && !hasTrim) {
    console.log(`[ffmpeg:build] WARNING: No active operations. FFmpeg will re-encode source without changes!`);
  }

  // Build the full command
  const args: string[] = ["-y"];

  if (hasTrim) {
    args.push("-ss", trimStart.toFixed(3));
    args.push("-to", trimEnd.toFixed(3));
  }

  args.push("-i", inputPath);

  if (videoFilters.length > 0) {
    args.push("-vf", videoFilters.join(","));
  }

  if (audioFilters.length > 0) {
    args.push("-af", audioFilters.join(","));
  }

  // Use best available encoder (hardware if GPU present, software fast otherwise).
  // Force software encoding when the select filter is active — Intel QSV chokes on
  // the variable frame rate that select+setpts produces ("Current frame rate is unsupported").
  const hasSelectFilter = videoFilters.some((f) => f.startsWith("select="));
  const encoder = hasSelectFilter ? { label: "libx264 (forced — select filter present)" } : detectBestEncoder();
  console.log(`[ffmpeg:build] Encoder: ${encoder.label}`);

  const encoderArgs = hasSelectFilter
    ? ["-c:v", "libx264", "-preset", "fast", "-crf", "23"]
    : getEncoderArgs();

  args.push(
    "-threads", "0", // use all CPU cores
    ...encoderArgs,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath
  );

  return { args, trimStart, trimEnd, speedFactor };
}

/**
 * Position map: convert position name to FFmpeg overlay coordinates.
 * Assumes 1080-wide video and 1024x1024 illustration scaled to fit.
 */
function getOverlayPosition(position: string, videoWidth: number, videoHeight: number): string {
  const margin = 20;
  const imgSize = Math.round(Math.min(videoWidth, videoHeight) * 0.3); // 30% of smaller dimension

  switch (position) {
    case "top-right":
      return `W-w-${margin}:${margin}`;
    case "top-left":
      return `${margin}:${margin}`;
    case "bottom-right":
      return `W-w-${margin}:H-h-${margin}`;
    case "bottom-left":
      return `${margin}:H-h-${margin}`;
    case "center":
      return "(W-w)/2:(H-h)/2";
    case "fullscreen":
      return "0:0";
    default:
      return `W-w-${margin}:${margin}`;
  }
}

interface IllustrationOverlay {
  imagePath: string;
  startTime: number;
  endTime: number;
  position: string;
  opacity: number;
}

/**
 * Build FFmpeg command to overlay illustrations on a video.
 * This runs as a SECOND pass after the main render, because overlays need filter_complex.
 */
export function buildIllustrationOverlayArgs(
  inputVideoPath: string,
  outputPath: string,
  illustrations: IllustrationOverlay[],
  videoWidth: number,
  videoHeight: number
): string[] {
  if (illustrations.length === 0) return [];

  const args: string[] = ["-y", "-i", inputVideoPath];

  // Add each illustration image as an input
  for (const illust of illustrations) {
    args.push("-i", illust.imagePath);
  }

  // Build filter_complex chain
  // Each overlay: scale image, set opacity, enable/disable by time, overlay on video
  const filters: string[] = [];
  let currentStream = "0:v";

  for (let i = 0; i < illustrations.length; i++) {
    const illust = illustrations[i];
    const inputIdx = i + 1; // input 0 is the video, 1+ are images
    const pos = getOverlayPosition(illust.position, videoWidth, videoHeight);

    // Scale the illustration image
    const scale = illust.position === "fullscreen"
      ? `scale=${videoWidth}:${videoHeight}`
      : `scale=${Math.round(videoWidth * 0.3)}:-1`;

    // Apply opacity using colorchannelmixer
    const alpha = illust.opacity.toFixed(2);

    // Enable overlay only during the time window
    const enable = `between(t,${illust.startTime.toFixed(3)},${illust.endTime.toFixed(3)})`;

    const scaledLabel = `img${i}`;
    const outLabel = i < illustrations.length - 1 ? `v${i}` : "vout";

    filters.push(`[${inputIdx}:v]${scale},format=rgba,colorchannelmixer=aa=${alpha}[${scaledLabel}]`);
    filters.push(`[${currentStream}][${scaledLabel}]overlay=${pos}:enable='${enable}'[${outLabel}]`);

    currentStream = outLabel;
  }

  args.push("-filter_complex", filters.join(";"));
  args.push("-map", `[${currentStream}]`);
  args.push("-map", "0:a");
  args.push(
    "-threads", "0",
    ...getEncoderArgs(),
    "-c:a", "copy",
    "-movflags", "+faststart",
    outputPath
  );

  console.log(`[ffmpeg:illustrations] Built overlay command for ${illustrations.length} illustrations`);

  return args;
}
