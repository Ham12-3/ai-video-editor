import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { db } from "@/lib/db";
import { projects, apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { extractAudio, detectSilence, extractFramesAtTimestamps, selectTranscriptAwareTimestamps } from "@/lib/video/extract";
import { transcribeAudio, detectFillerWords } from "@/lib/ai/transcribe";
import { runPass1, runPass2, runSelfReview } from "@/lib/ai/analyze";
import type { AnalysisInput } from "@/lib/ai/analyze";
import { estimateTranscriptionCost, calculateActualCost } from "@/lib/ai/cost";
import { emitProgress } from "@/lib/queue/progress";
import { withStageProgress } from "@/lib/queue/stage-progress";
import type { EditDecisionList } from "@/types/edl";

interface AnalyzeJobData {
  projectId: string;
  userId: string;
  prompt: string;
}

export async function runAnalyzeJob(data: AnalyzeJobData): Promise<EditDecisionList> {
  const { projectId, userId, prompt } = data;

  console.log(`[analyze] Starting two-pass analysis for project ${projectId}`);

  // ── 1. Get API key ──

  const keyRows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, "openai")))
    .limit(1);

  if (keyRows.length === 0) {
    throw new Error("No OpenAI API key found. Please add one in Settings.");
  }

  const apiKey = decrypt({
    encryptedKey: keyRows[0].encryptedKey,
    iv: keyRows[0].iv,
    authTag: keyRows[0].authTag,
  });

  // ── 2. Get project ──

  const projectRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (projectRows.length === 0) throw new Error("Project not found");

  const project = projectRows[0];
  const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
  const projectDir = join(uploadDir, userId, projectId);
  const sourcePath = join(projectDir, "source.mp4");

  await db
    .update(projects)
    .set({ status: "analyzing", prompt, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // Roughly: audio extraction = 2s/min of video, transcription = 10s/min of
  // video, GPT passes = 8-20s, frame extraction = 1.5s/frame. These are just
  // ticker estimates — the real work finishes when it finishes.
  const videoDurationSec = project.sourceVideoDuration ?? 60;
  const estAudioMs = Math.max(2_000, videoDurationSec * 200);
  const estTranscribeMs = Math.max(6_000, videoDurationSec * 1_400);
  const estPass1Ms = 12_000;
  const estPass2Ms = 18_000;
  const estReviewMs = 10_000;
  const estFramesMs = 12_000;

  // ── 3. Extract audio ──

  const audioPath = join(projectDir, "audio.wav");
  await withStageProgress(projectId, "extracting_audio", estAudioMs, {}, () =>
    extractAudio(sourcePath, audioPath)
  );

  // ── 4. Detect silence ──

  const silences = await detectSilence(audioPath);
  console.log(`[analyze] Detected ${silences.length} silence segments`);

  // ── 5. Transcribe ──

  const hybridEnabled = process.env.ENABLE_HYBRID_TRANSCRIPTION === "true";
  if (hybridEnabled) {
    console.log(`[analyze] Hybrid transcription enabled`);
  }
  const transcript = await withStageProgress(
    projectId,
    "transcribing",
    estTranscribeMs,
    {},
    () => transcribeAudio(audioPath, apiKey)
  );

  console.log(`[analyze] Transcript: ${transcript.words.length} words, ${transcript.segments.length} segments`);

  // Save transcript for render worker
  await writeFile(
    join(projectDir, "transcript.json"),
    JSON.stringify(transcript, null, 2),
    "utf-8"
  );

  // ── 6. Detect filler words ──

  const fillerWords = detectFillerWords(transcript.words);
  console.log(`[analyze] Detected ${fillerWords.length} filler words`);

  // ── 7. Pass 1: Transcript analysis (text-only, no images) ──
  // Run Pass 1 IN PARALLEL with a speculative transcript-aware frame extraction.
  // Pass 1 hits OpenAI (~8-15s) and frame extraction is CPU-bound (~1.5s/frame).
  // If Pass 1 comes back with better timestamps, we extract those too; most of
  // the time the heuristic picks are fine and we save ~15-20s per analysis.

  const analysisInput: AnalysisInput = {
    transcript,
    silences,
    fillerWords,
    videoMeta: {
      duration: project.sourceVideoDuration ?? 0,
      width: project.sourceVideoWidth ?? 0,
      height: project.sourceVideoHeight ?? 0,
      fps: project.sourceVideoFps ?? 30,
    },
    userPrompt: prompt,
    apiKey,
  };

  const videoDuration = project.sourceVideoDuration ?? 0;
  const speculativeTimestamps = selectTranscriptAwareTimestamps(
    transcript,
    silences,
    fillerWords,
    videoDuration
  ).slice(0, 15);

  console.log(
    `[analyze] Speculative frame timestamps (${speculativeTimestamps.length}): ${speculativeTimestamps.map((t) => t.toFixed(1) + "s").join(", ")}`
  );

  const framesDir = join(projectDir, "frames");
  await mkdir(framesDir, { recursive: true });

  // Kick off frame extraction + Pass 1 concurrently
  const framesPromise = withStageProgress(
    projectId,
    "extracting_frames",
    Math.max(estFramesMs, speculativeTimestamps.length * 1_500),
    { frameCount: speculativeTimestamps.length },
    () => extractFramesAtTimestamps(sourcePath, framesDir, speculativeTimestamps, transcript)
  );

  const pass1Promise = withStageProgress(
    projectId,
    "transcript_analysis",
    estPass1Ms,
    {},
    () => runPass1(analysisInput)
  );

  const [framesFromSpeculative, pass1Result] = await Promise.all([
    framesPromise,
    pass1Promise,
  ]);
  const { result: pass1, tokens: pass1Tokens } = pass1Result;

  // ── 8. Reconcile frame selection ──
  // If Pass 1 produced meaningfully different timestamps, re-extract the missing
  // ones. Otherwise reuse the speculative set we already have on disk.
  let timestamps = pass1.keyFrameTimestamps.slice(0, 15);
  let frames = framesFromSpeculative;

  if (timestamps.length >= 3) {
    // Figure out which Pass 1 picks are NOT already in the speculative set
    const EPS = 0.5; // seconds — consider timestamps within 0.5s as equivalent
    const missing = timestamps.filter(
      (t) => !speculativeTimestamps.some((s) => Math.abs(s - t) < EPS)
    );

    if (missing.length === 0) {
      console.log(
        `[analyze] Pass 1 timestamps match speculative set — no extra extraction`
      );
    } else {
      console.log(
        `[analyze] Pass 1 requested ${missing.length} additional frames: ${missing.map((t) => t.toFixed(1) + "s").join(", ")}`
      );
      const extraFrames = await extractFramesAtTimestamps(
        sourcePath,
        framesDir,
        missing,
        transcript
      );
      // Merge + dedupe by timestamp
      const merged = [...framesFromSpeculative, ...extraFrames];
      const seen = new Set<number>();
      frames = merged.filter((f) => {
        const key = Math.round(f.timestamp * 10);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  } else {
    console.log(
      `[analyze] Pass 1 returned only ${timestamps.length} timestamps, keeping speculative set`
    );
    timestamps = speculativeTimestamps;
  }

  console.log(`[analyze] Final frame count: ${frames.length}`);

  // Emit a final "extracting_frames" progress event so the UI ticks the stage
  // to done. The actual extraction already happened concurrently with Pass 1
  // via the framesPromise above — no duplicate work here.
  emitProgress(projectId, {
    stage: "extracting_frames",
    progress: 100,
    frameCount: frames.length,
  });

  // ── 9. Pass 2: Visual analysis + EDL (multimodal) ──

  const transcriptionCost = estimateTranscriptionCost(project.sourceVideoDuration ?? 0);

  const { edl: rawEdl, tokens: pass2Tokens } = await withStageProgress(
    projectId,
    "visual_analysis",
    estPass2Ms,
    {
      estimatedCost: `Pass 1: ${pass1Tokens} tokens. Transcription: ${transcriptionCost.display}. Pass 2 running...`,
    },
    () => runPass2(analysisInput, pass1, frames)
  );

  // ── 10. Self-review ──

  const {
    edl: reviewedEdl,
    confidence,
    issues,
    tokens: reviewTokens,
  } = await withStageProgress(
    projectId,
    "edl_review",
    estReviewMs,
    {},
    () => runSelfReview(rawEdl, transcript, apiKey)
  );

  console.log(`[analyze] Review confidence: ${confidence}, issues: ${issues.length}`);
  console.log(`[analyze] Tokens: pass1=${pass1Tokens}, pass2=${pass2Tokens}, review=${reviewTokens}, total=${pass1Tokens + pass2Tokens + reviewTokens}`);

  // ── 11. Calculate costs ──

  const totalTokens = pass1Tokens + pass2Tokens + reviewTokens;
  const pass1Cost = calculateActualCost(pass1Tokens, 0, "gpt-5.4");
  const pass2Cost = calculateActualCost(pass2Tokens, 0, "gpt-5.4");
  const reviewCost = calculateActualCost(reviewTokens, 0, "gpt-5.4-mini");

  // ── 12. Save EDL ──

  emitProgress(projectId, { stage: "generating_edl", progress: 50 });

  await db
    .update(projects)
    .set({
      status: "editing",
      editDecisionList: {
        ...reviewedEdl,
        _meta: {
          pass1Tokens,
          pass2Tokens,
          reviewTokens,
          totalTokens,
          actualCost: pass1Cost.cost + pass2Cost.cost + reviewCost.cost,
          transcriptionCost: transcriptionCost.cost,
          frameCount: frames.length,
          silenceCount: silences.length,
          fillerWordCount: fillerWords.length,
          reviewConfidence: confidence,
          reviewIssueCount: issues.length,
          // Timestamps for the render pipeline (used by silence_remove)
          silences: silences.map((s) => ({ start: s.start, end: s.end })),
          fillerWordTimestamps: fillerWords.map((f) => ({ start: f.start, end: f.end, word: f.word })),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  emitProgress(projectId, { stage: "generating_edl", progress: 100 });

  // ── 13. Done ──

  emitProgress(projectId, { stage: "edl_complete", edl: reviewedEdl });

  return reviewedEdl;
}
