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
} from "@/types/edl";

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
    console.log(`[ffmpeg:exec] Spawning: ffmpeg ${args.join(" ")}`);
    const proc = spawn("ffmpeg", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";

    proc.stderr?.on("data", (data: Buffer) => {
      const line = data.toString();
      stderr += line;

      // Log non-progress stderr lines (errors, warnings, stream info)
      if (!line.includes("frame=") && !line.includes("size=") && line.trim().length > 0) {
        console.log(`[ffmpeg:stderr] ${line.trim()}`);
      }

      const match = line.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseFloat(match[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        const percent = Math.min(
          99,
          Math.round((currentTime / totalDuration) * 100)
        );
        onProgress(percent);
      }
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

  // 1. Generate subtitles if captions are in the EDL
  let subtitlePath: string | undefined;

  const captionOp = edl.operations.find(
    (op, i) => op.type === "caption" && !disabled.has(i)
  ) as CaptionOperation | undefined;

  console.log(`[render:pipeline] Caption operation found: ${!!captionOp}`);
  console.log(`[render:pipeline] Words available: ${words?.length ?? 0}`);

  if (captionOp && words && words.length > 0) {
    emitProgress(projectId, {
      stage: "rendering",
      progress: 5,
      currentStep: "Generating subtitles...",
    });

    // Generate ASS file with trim offset so timestamps start at 0
    const assContent = generateSubtitles(
      words,
      captionOp,
      trimStart,
      trimEnd
    );
    subtitlePath = join(projectDir, "captions.ass");
    await writeFile(subtitlePath, assContent, "utf-8");
    console.log(`[render:pipeline] ASS subtitle file written to: ${subtitlePath}`);
    console.log(`[render:pipeline] ASS content length: ${assContent.length} chars`);
    console.log(`[render:pipeline] ASS first 500 chars:`, assContent.slice(0, 500));
  }

  // 2. Build FFmpeg command
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
        cleanArgs.splice(caIdx, 0, "-preset", "fast", "-crf", "23");
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

  // 4. Illustration overlays (separate pass if illustrations exist)
  // The model sometimes emits multiple illustration ops — merge them all into one.
  const illustrationOps = edl.operations.filter(
    (op, i) => op.type === "illustration" && !disabled.has(i)
  ) as IllustrationOperation[];

  const mergedIllustrations = illustrationOps.flatMap((op) => op.illustrations ?? []);
  const illustrationOp: IllustrationOperation | undefined =
    mergedIllustrations.length > 0
      ? { type: "illustration", illustrations: mergedIllustrations }
      : undefined;

  if (illustrationOps.length > 1) {
    console.log(`[render:pipeline] Merged ${illustrationOps.length} illustration ops into ${mergedIllustrations.length} overlays`);
  }

  if (illustrationOp && illustrationOp.illustrations?.length > 0) {
    emitProgress(projectId, {
      stage: "rendering",
      progress: 82,
      currentStep: "Generating illustrations...",
    });

    // Get API key for Nano Banana (Gemini 2.5 Flash Image)
    try {
      const keyRows = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, "gemini")))
        .limit(1);

      if (keyRows.length === 0) {
        console.log(`[render:pipeline] No Gemini API key configured — skipping illustration overlays. Add one in Settings to enable.`);
      }

      if (keyRows.length > 0) {
        const apiKey = decrypt({
          encryptedKey: keyRows[0].encryptedKey,
          iv: keyRows[0].iv,
          authTag: keyRows[0].authTag,
        });

        // Adjust illustration timestamps for trim offset
        const adjustedIllustrations = illustrationOp.illustrations.map((ill) => ({
          ...ill,
          startTime: Math.max(0, ill.startTime - trimStart),
          endTime: ill.endTime - trimStart,
        }));

        const generatedImages = await generateIllustrations(
          { ...illustrationOp, illustrations: adjustedIllustrations },
          projectDir,
          apiKey,
          (current, total) => {
            const pct = 82 + Math.round((current / total) * 8);
            emitProgress(projectId, {
              stage: "rendering",
              progress: pct,
              currentStep: `Generating illustration ${current}/${total}...`,
            });
          }
        );

        if (generatedImages.length > 0) {
          emitProgress(projectId, {
            stage: "rendering",
            progress: 90,
            currentStep: "Overlaying illustrations...",
          });

          // Overlay pass: output.mp4 -> output_with_illust.mp4 -> rename back
          const illustOutputPath = join(projectDir, "output_illustrated.mp4");

          const overlayArgs = buildIllustrationOverlayArgs(
            outputPath,
            illustOutputPath,
            generatedImages.map((img) => ({
              imagePath: img.imagePath,
              startTime: img.startTime,
              endTime: img.endTime,
              position: img.position,
              opacity: img.opacity,
            })),
            edl.sourceVideo.width,
            edl.sourceVideo.height
          );

          if (overlayArgs.length > 0) {
            await runFFmpeg(overlayArgs, estimatedDuration, () => {});

            // Replace output with illustrated version
            const { rename } = await import("fs/promises");
            await rename(illustOutputPath, outputPath);
            console.log(`[render:pipeline] Illustration overlay complete`);
          }
        }
      }
    } catch (err) {
      console.log(`[render:pipeline] Illustration generation failed (non-fatal):`, err instanceof Error ? err.message : err);
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
