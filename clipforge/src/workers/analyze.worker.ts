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

  // ── 3. Extract audio ──

  emitProgress(projectId, { stage: "extracting_audio", progress: 0 });
  const audioPath = join(projectDir, "audio.wav");
  await extractAudio(sourcePath, audioPath);
  emitProgress(projectId, { stage: "extracting_audio", progress: 100 });

  // ── 4. Detect silence ──

  const silences = await detectSilence(audioPath);
  console.log(`[analyze] Detected ${silences.length} silence segments`);

  // ── 5. Transcribe ──

  const hybridEnabled = process.env.ENABLE_HYBRID_TRANSCRIPTION === "true";
  emitProgress(projectId, { stage: "transcribing", progress: 0 });
  if (hybridEnabled) {
    console.log(`[analyze] Hybrid transcription enabled`);
  }
  const transcript = await transcribeAudio(audioPath, apiKey);
  emitProgress(projectId, { stage: "transcribing", progress: 100 });

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

  emitProgress(projectId, { stage: "transcript_analysis", progress: 0 });

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

  const { result: pass1, tokens: pass1Tokens } = await runPass1(analysisInput);

  emitProgress(projectId, { stage: "transcript_analysis", progress: 100 });

  // ── 8. Targeted frame extraction ──
  // Use Pass 1 timestamps if available, otherwise fall back to transcript-aware heuristics

  let timestamps = pass1.keyFrameTimestamps;
  const videoDuration = project.sourceVideoDuration ?? 0;

  if (timestamps.length < 3) {
    console.log(`[analyze] Pass 1 returned ${timestamps.length} timestamps, falling back to transcript-aware selection`);
    timestamps = selectTranscriptAwareTimestamps(
      transcript,
      silences,
      fillerWords,
      videoDuration
    );
  } else {
    console.log(`[analyze] Using ${timestamps.length} timestamps from Pass 1`);
  }

  // Cap at 15 frames
  timestamps = timestamps.slice(0, 15);
  console.log(`[analyze] Extracting ${timestamps.length} frames at: ${timestamps.map(t => t.toFixed(1) + "s").join(", ")}`);

  emitProgress(projectId, { stage: "extracting_frames", progress: 0, frameCount: 0 });

  const framesDir = join(projectDir, "frames");
  await mkdir(framesDir, { recursive: true });
  const frames = await extractFramesAtTimestamps(sourcePath, framesDir, timestamps, transcript);

  emitProgress(projectId, {
    stage: "extracting_frames",
    progress: 100,
    frameCount: frames.length,
  });

  // ── 9. Pass 2: Visual analysis + EDL (multimodal) ──

  const transcriptionCost = estimateTranscriptionCost(project.sourceVideoDuration ?? 0);

  emitProgress(projectId, {
    stage: "visual_analysis",
    progress: 0,
    estimatedCost: `Pass 1: ${pass1Tokens} tokens. Transcription: ${transcriptionCost.display}. Pass 2 running...`,
  });

  const { edl: rawEdl, tokens: pass2Tokens } = await runPass2(
    analysisInput,
    pass1,
    frames
  );

  emitProgress(projectId, {
    stage: "visual_analysis",
    progress: 100,
    estimatedCost: "",
  });

  // ── 10. Self-review ──

  emitProgress(projectId, { stage: "edl_review", progress: 0 });

  const {
    edl: reviewedEdl,
    confidence,
    issues,
    tokens: reviewTokens,
  } = await runSelfReview(rawEdl, transcript, apiKey);

  emitProgress(projectId, { stage: "edl_review", progress: 100 });

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
