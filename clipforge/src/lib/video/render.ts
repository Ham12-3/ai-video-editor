import { spawn } from "child_process";
import { join } from "path";
import { writeFile, stat } from "fs/promises";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { emitProgress } from "@/lib/queue/progress";
import { buildFFmpegArgs, buildIllustrationOverlayArgs } from "./ffmpeg";
import { generateSubtitles } from "./subtitles";
import { generateThumbnail } from "./metadata";
import { generateIllustrations } from "@/lib/ai/illustrations";
import { decrypt } from "@/lib/encryption";
import { apiKeys } from "@/lib/db/schema";
import { and } from "drizzle-orm";
import type {
  EditDecisionList,
  CaptionOperation,
  TrimOperation,
  IllustrationOperation,
  HookOperation,
  ReframeOperation,
} from "@/types/edl";

/**
 * Compute the ACTUAL output dimensions after applying the reframe op.
 * Needed for the illustration overlay pass to place half-screen and fullscreen
 * images correctly. Without this, half-screen on a reframed 1080×1920 video
 * would use source 1920×1080 math and the image would be half as tall as
 * intended, leaving a visible gap.
 */
function computeOutputDimensions(
  edl: EditDecisionList,
  disabled: Set<number>
): { width: number; height: number } {
  const reframe = edl.operations.find(
    (op, i) => op.type === "reframe" && !disabled.has(i)
  ) as ReframeOperation | undefined;

  if (!reframe) {
    return {
      width: edl.sourceVideo.width,
      height: edl.sourceVideo.height,
    };
  }

  switch (reframe.targetAspectRatio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "4:5":
      return { width: 1080, height: 1350 };
    default:
      return { width: 1080, height: 1920 };
  }
}

interface RenderJobData {
  projectId: string;
  userId: string;
  edl: EditDecisionList;
  disabledOps: number[];
  words?: Array<{ word: string; start: number; end: number }>;
}

/**
 * Execute FFmpeg with progress parsing.
 */
function runFFmpeg(
  args: string[],
  totalDuration: number,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Force FFmpeg to flush progress every 0.5s to a dedicated stdout channel
    // in machine-readable key=value blocks. On Windows this fixes the classic
    // "stuck at 0% then jump to 100%" issue caused by stderr carriage-return
    // buffering. The -progress flag MUST come after input args; FFmpeg parses
    // global options left-to-right, so we inject it right before the output.
    const outputIdx = args.length - 1;
    const fullArgs = [
      ...args.slice(0, outputIdx),
      "-stats_period", "0.5",
      "-progress", "pipe:1",
      args[outputIdx],
    ];

    console.log(`[ffmpeg:exec] Spawning: ffmpeg ${fullArgs.join(" ")}`);
    const proc = spawn("ffmpeg", fullArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    let lastPercent = -1;

    const handleTime = (currentTimeSeconds: number) => {
      const percent = Math.min(
        99,
        Math.max(0, Math.round((currentTimeSeconds / totalDuration) * 100))
      );
      // Only emit when the integer percent actually changes — avoids SSE spam
      if (percent !== lastPercent) {
        lastPercent = percent;
        onProgress(percent);
      }
    };

    // -progress pipe:1 writes key=value blocks to stdout, e.g.
    //   frame=42
    //   fps=30.0
    //   out_time_us=1400000
    //   out_time=00:00:01.400000
    //   progress=continue
    proc.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      const matches = chunk.matchAll(/out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/g);
      let last: number | null = null;
      for (const m of matches) {
        last =
          parseInt(m[1], 10) * 3600 +
          parseInt(m[2], 10) * 60 +
          parseFloat(m[3]);
      }
      if (last !== null) handleTime(last);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const line = data.toString();
      stderr += line;

      // Log non-progress stderr lines (errors, warnings, stream info)
      if (!line.includes("frame=") && !line.includes("size=") && line.trim().length > 0) {
        console.log(`[ffmpeg:stderr] ${line.trim()}`);
      }

      // Fallback: parse time= from stderr too (matchAll to catch the LAST
      // value in a carriage-return-concatenated chunk on Windows).
      const matches = line.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g);
      let last: number | null = null;
      for (const m of matches) {
        last =
          parseInt(m[1], 10) * 3600 +
          parseInt(m[2], 10) * 60 +
          parseFloat(m[3]);
      }
      if (last !== null) handleTime(last);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const lines = stderr.split("\n").filter((l) => l.trim());
        const errorMsg = lines.slice(-8).join("\n");
        reject(new Error(`FFmpeg exited with code ${code}: ${errorMsg}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Full render pipeline.
 */
export async function renderVideo(data: RenderJobData): Promise<string> {
  const { projectId, userId, edl, disabledOps, words } = data;
  const disabled = new Set(disabledOps);

  console.log(`[render:pipeline] disabledOps array:`, disabledOps);
  console.log(`[render:pipeline] disabled Set contents:`, [...disabled]);
  console.log(`[render:pipeline] Total operations: ${edl.operations.length}, Disabled: ${disabled.size}, Active: ${edl.operations.length - disabled.size}`);

  const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
  const projectDir = join(uploadDir, userId, projectId);
  const inputPath = join(projectDir, "source.mp4");
  const outputPath = join(projectDir, "output.mp4");

  // Figure out trim offset first (needed for subtitle alignment)
  let trimStart = 0;
  let trimEnd = edl.sourceVideo.duration;
  for (let i = 0; i < edl.operations.length; i++) {
    if (disabled.has(i)) continue;
    if (edl.operations[i].type === "trim") {
      const trimOp = edl.operations[i] as TrimOperation;
      trimStart = trimOp.startTime;
      trimEnd = trimOp.endTime;
    }
  }

  // 1. Generate subtitles if captions OR a hook are in the EDL.
  // Both ride on the same ASS file (separate styles inside).
  let subtitlePath: string | undefined;

  const captionOp = edl.operations.find(
    (op, i) => op.type === "caption" && !disabled.has(i)
  ) as CaptionOperation | undefined;

  const hookOp = edl.operations.find(
    (op, i) => op.type === "hook" && !disabled.has(i)
  ) as HookOperation | undefined;

  console.log(`[render:pipeline] Caption operation found: ${!!captionOp}`);
  console.log(`[render:pipeline] Hook operation found: ${!!hookOp}${hookOp ? ` — "${hookOp.text}"` : ""}`);
  console.log(`[render:pipeline] Words available: ${words?.length ?? 0}`);

  // Output duration estimate (for hook banner full-span timing).
  // Use EDL's explicit estimate, or fall back to the trimmed window.
  const outputDurationForHook =
    edl.estimatedOutputDuration && edl.estimatedOutputDuration > 0
      ? edl.estimatedOutputDuration
      : Math.max(0, trimEnd - trimStart);

  const needsSubtitleFile =
    (!!captionOp && !!words && words.length > 0) || !!hookOp;

  if (needsSubtitleFile) {
    emitProgress(projectId, {
      stage: "rendering",
      progress: 5,
      currentStep: captionOp && hookOp
        ? "Generating subtitles and hook..."
        : hookOp
          ? "Pinning hook banner..."
          : "Generating subtitles...",
    });

    const assContent = generateSubtitles(
      words ?? [],
      captionOp ?? null,
      trimStart,
      trimEnd,
      hookOp,
      outputDurationForHook
    );

    if (assContent) {
      subtitlePath = join(projectDir, "captions.ass");
      await writeFile(subtitlePath, assContent, "utf-8");
      console.log(`[render:pipeline] ASS subtitle file written to: ${subtitlePath}`);
      console.log(`[render:pipeline] ASS content length: ${assContent.length} chars`);
      console.log(`[render:pipeline] ASS first 500 chars:`, assContent.slice(0, 500));
    } else {
      console.log(`[render:pipeline] ASS generator returned null — nothing to render`);
    }
  }

  // 2. Collect illustration ops up-front so we can start Nano Banana generation
  // IN PARALLEL with the main FFmpeg encode. Image gen takes ~3-5s per image on
  // the wire — running it concurrently with the encode shaves real time.
  const illustrationOps = edl.operations.filter(
    (op, i) => op.type === "illustration" && !disabled.has(i)
  ) as IllustrationOperation[];

  const mergedIllustrations = illustrationOps.flatMap((op) => op.illustrations ?? []);
  const mergedIllustrationOp: IllustrationOperation | undefined =
    mergedIllustrations.length > 0
      ? { type: "illustration", illustrations: mergedIllustrations }
      : undefined;

  if (illustrationOps.length > 1) {
    console.log(`[render:pipeline] Merged ${illustrationOps.length} illustration ops into ${mergedIllustrations.length} overlays`);
  }

  // Kick off Nano Banana generation NOW (not awaited). It runs in the background
  // while FFmpeg encodes. We await this promise later, just before the overlay pass.
  let illustrationPromise: Promise<Awaited<ReturnType<typeof generateIllustrations>>> | null = null;

  if (mergedIllustrationOp && mergedIllustrationOp.illustrations.length > 0) {
    const keyRows = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, "gemini")))
      .limit(1);

    if (keyRows.length === 0) {
      console.log(`[render:pipeline] No Gemini API key — skipping illustration overlays. Add one in Settings to enable.`);
    } else {
      const apiKey = decrypt({
        encryptedKey: keyRows[0].encryptedKey,
        iv: keyRows[0].iv,
        authTag: keyRows[0].authTag,
      });

      const adjustedIllustrations = mergedIllustrationOp.illustrations.map((ill) => ({
        ...ill,
        startTime: Math.max(0, ill.startTime - trimStart),
        endTime: ill.endTime - trimStart,
      }));

      console.log(`[render:pipeline] Kicking off ${adjustedIllustrations.length} Nano Banana generations in parallel with encode`);

      illustrationPromise = generateIllustrations(
        { ...mergedIllustrationOp, illustrations: adjustedIllustrations },
        projectDir,
        apiKey,
        (current, total) => {
          emitProgress(projectId, {
            stage: "rendering",
            // Keep progress in the 0-15 range while encode hasn't started;
            // the encode callback (15-90) overrides visually anyway.
            progress: 5 + Math.round((current / total) * 10),
            currentStep: `Generating illustrations ${current}/${total} (in background)...`,
          });
        }
      ).catch((err) => {
        console.log(`[render:pipeline] Illustration generation failed (non-fatal):`, err instanceof Error ? err.message : err);
        return [] as Awaited<ReturnType<typeof generateIllustrations>>;
      });
    }
  }

  // 3. Build FFmpeg command
  emitProgress(projectId, {
    stage: "rendering",
    progress: 10,
    currentStep: "Building render pipeline...",
  });

  console.log(`[render:pipeline] Calling buildFFmpegArgs with subtitlePath: ${subtitlePath ?? "NONE"}`);

  const { args: ffmpegArgs, speedFactor } = buildFFmpegArgs(
    inputPath,
    outputPath,
    edl,
    subtitlePath,
    disabled
  );

  console.log(`[render:pipeline] FFmpeg speedFactor: ${speedFactor}`);
  console.log(`[render:pipeline] FFmpeg args count: ${ffmpegArgs.length}`);
  console.log(`[render:pipeline] FULL FFMPEG COMMAND: ffmpeg ${ffmpegArgs.join(" ")}`);

  // Check for passthrough (no filters)
  const hasVF = ffmpegArgs.includes("-vf");
  const hasAF = ffmpegArgs.includes("-af");
  const hasSS = ffmpegArgs.includes("-ss");
  console.log(`[render:pipeline] Has -vf: ${hasVF}, Has -af: ${hasAF}, Has -ss (trim): ${hasSS}`);
  if (!hasVF && !hasAF && !hasSS) {
    console.log(`[render:pipeline] WARNING: No active filters or trim. FFmpeg will re-encode source without changes!`);
  }

  // 3. Execute FFmpeg
  emitProgress(projectId, {
    stage: "rendering",
    progress: 15,
    currentStep: "Rendering video...",
  });

  const trimmedDuration = trimEnd - trimStart;
  const estimatedDuration =
    speedFactor !== 1
      ? trimmedDuration / speedFactor
      : edl.estimatedOutputDuration || trimmedDuration;

  const progressCallback = (percent: number) => {
    const scaledProgress = 15 + Math.round(percent * 0.75);
    emitProgress(projectId, {
      stage: "rendering",
      progress: scaledProgress,
      currentStep: `Rendering... ${percent}%`,
    });
  };

  try {
    await runFFmpeg(ffmpegArgs, estimatedDuration, progressCallback);
  } catch (hwErr) {
    // If hardware encoder failed, retry with software
    const errMsg = hwErr instanceof Error ? hwErr.message : "";
    if (
      errMsg.includes("Error while opening encoder") ||
      errMsg.includes("Function not implemented") ||
      errMsg.includes("Invalid argument")
    ) {
      console.log(`[render:pipeline] Hardware encoder failed, retrying with software (libx264 fast)...`);
      const { resetEncoderCache } = await import("./hwaccel");
      resetEncoderCache(); // Don't try this HW encoder again

      // Replace encoder args in the command
      const swArgs = ffmpegArgs.map((arg) => {
        if (arg === "h264_nvenc" || arg === "h264_amf" || arg === "h264_qsv") return "libx264";
        return arg;
      });
      // Remove hardware-specific flags and add software ones
      const cleanArgs: string[] = [];
      const hwFlags = ["-preset", "p4", "-rc", "vbr", "-cq", "-b:v", "-quality", "balanced", "vbr_latency", "-qp_i", "-qp_p", "-global_quality"];
      let skipNext = false;
      for (const arg of swArgs) {
        if (skipNext) { skipNext = false; continue; }
        if (hwFlags.includes(arg)) { skipNext = true; continue; }
        cleanArgs.push(arg);
      }
      // Insert software preset before -c:a
      const caIdx = cleanArgs.indexOf("-c:a");
      if (caIdx > 0) {
        cleanArgs.splice(caIdx, 0, "-preset", "veryfast", "-crf", "23");
      }

      emitProgress(projectId, {
        stage: "rendering",
        progress: 15,
        currentStep: "Retrying with software encoder...",
      });

      await runFFmpeg(cleanArgs, estimatedDuration, progressCallback);
    } else {
      throw hwErr;
    }
  }

  // 3b. Verify output has video stream (catch silent failures)
  try {
    const { execSync } = await import("child_process");
    const probeResult = execSync(
      `ffprobe -v error -select_streams v -show_entries stream=codec_type -of csv=p=0 "${outputPath}"`,
      { encoding: "utf-8", timeout: 10000 }
    ).trim();
    if (!probeResult.includes("video")) {
      console.log(`[render:pipeline] CRITICAL: Output has no video stream. FFmpeg filter chain likely failed.`);
      console.log(`[render:pipeline] FFmpeg command was: ffmpeg ${ffmpegArgs.join(" ")}`);
      throw new Error("Render produced audio-only output. The video stream was lost during processing. Try disabling some operations (especially silence removal) and re-render.");
    }
    console.log(`[render:pipeline] Output verified: has video stream`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("audio-only")) throw err;
    console.log(`[render:pipeline] Could not verify output streams:`, err instanceof Error ? err.message : err);
  }

  // 4. Illustration overlay pass — await the background generation kicked off
  // before the encode. If nothing was generated (no Gemini key, all failed),
  // skip the second FFmpeg pass entirely.
  if (illustrationPromise) {
    emitProgress(projectId, {
      stage: "rendering",
      progress: 88,
      currentStep: "Waiting for illustrations...",
    });

    const generatedImages = await illustrationPromise;

    if (generatedImages.length > 0) {
      emitProgress(projectId, {
        stage: "rendering",
        progress: 90,
        currentStep: `Overlaying ${generatedImages.length} illustrations...`,
      });

      const illustOutputPath = join(projectDir, "output_illustrated.mp4");
      const { width: outW, height: outH } = computeOutputDimensions(edl, disabled);
      console.log(`[render:pipeline] Overlay pass dimensions: ${outW}x${outH}`);

      const overlayArgs = buildIllustrationOverlayArgs(
        outputPath,
        illustOutputPath,
        generatedImages.map((img) => ({
          imagePath: img.imagePath,
          startTime: img.startTime,
          endTime: img.endTime,
          position: img.position,
          opacity: img.opacity,
          animation: img.animation,
        })),
        outW,
        outH
      );

      if (overlayArgs.length > 0) {
        await runFFmpeg(overlayArgs, estimatedDuration, (percent) => {
          emitProgress(projectId, {
            stage: "rendering",
            progress: 90 + Math.round(percent * 0.07),
            currentStep: `Overlaying illustrations... ${percent}%`,
          });
        });
        const { rename } = await import("fs/promises");
        await rename(illustOutputPath, outputPath);
        console.log(`[render:pipeline] Illustration overlay complete`);
      }
    } else {
      console.log(`[render:pipeline] No illustrations produced, skipping overlay pass`);
    }
  }

  // 5. Generate output thumbnail
  emitProgress(projectId, {
    stage: "rendering",
    progress: 92,
    currentStep: "Generating thumbnail...",
  });

  try {
    await generateThumbnail(outputPath, projectDir, 2);
  } catch {
    // Non-fatal
  }

  // 5. Get output stats
  await stat(outputPath);

  // 6. Update project
  emitProgress(projectId, {
    stage: "rendering",
    progress: 98,
    currentStep: "Finalizing...",
  });

  const outputVideoUrl = `/api/video/${userId}/${projectId}/output.mp4`;

  await db
    .update(projects)
    .set({
      status: "completed",
      outputVideoUrl,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  // 7. Done
  emitProgress(projectId, {
    stage: "render_complete",
    outputUrl: outputVideoUrl,
  });

  return outputVideoUrl;
}
