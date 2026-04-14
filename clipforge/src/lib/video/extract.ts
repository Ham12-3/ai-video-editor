import ffmpeg from "fluent-ffmpeg";
import { readFile, mkdir } from "fs/promises";
import { join } from "path";
import type { TranscriptionResult, TranscriptionWord, FillerWordDetection } from "@/lib/ai/transcribe";

const MAX_FRAMES = 15;
const DEDUP_WINDOW = 2.0; // seconds: skip a timestamp if within this range of an existing one

// ── Audio Extraction ──

export function extractAudio(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });
}

// ── Silence Detection ──

export function detectSilence(
  audioPath: string,
  noiseThreshold: string = "-30dB",
  minDuration: number = 0.5
): Promise<Array<{ start: number; end: number; duration: number }>> {
  return new Promise((resolve, reject) => {
    const silences: Array<{ start: number; end: number; duration: number }> = [];
    let currentStart: number | null = null;

    ffmpeg(audioPath)
      .audioFilters(`silencedetect=noise=${noiseThreshold}:d=${minDuration}`)
      .format("null")
      .output("-")
      .on("stderr", (line: string) => {
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        if (startMatch) {
          currentStart = parseFloat(startMatch[1]);
        }
        const endMatch = line.match(
          /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/
        );
        if (endMatch && currentStart !== null) {
          silences.push({
            start: currentStart,
            end: parseFloat(endMatch[1]),
            duration: parseFloat(endMatch[2]),
          });
          currentStart = null;
        }
      })
      .on("end", () => resolve(silences))
      .on("error", (err: Error) => reject(err))
      .run();
  });
}

// ── Transcript-Aware Frame Selection ──

interface FrameCandidate {
  timestamp: number;
  reason: string;
  priority: number; // lower = more important
}

/**
 * Analyze transcript to pick meaningful frame timestamps.
 * Used as a fallback when Pass 1 doesn't provide keyFrameTimestamps.
 */
export function selectTranscriptAwareTimestamps(
  transcript: TranscriptionResult,
  silences: Array<{ start: number; end: number; duration: number }>,
  fillerWords: FillerWordDetection[],
  videoDuration: number
): number[] {
  const candidates: FrameCandidate[] = [];

  // 1. First and last 3 seconds (hook and ending)
  candidates.push({ timestamp: 1.0, reason: "hook_start", priority: 0 });
  candidates.push({ timestamp: 3.0, reason: "hook_mid", priority: 1 });
  if (videoDuration > 6) {
    candidates.push({
      timestamp: Math.max(0, videoDuration - 2),
      reason: "ending",
      priority: 1,
    });
  }

  // 2. Silence boundaries (topic transitions)
  for (const s of silences) {
    // Frame right after silence ends (new topic starts)
    if (s.end < videoDuration - 1) {
      candidates.push({
        timestamp: s.end + 0.3,
        reason: "after_silence",
        priority: 2,
      });
    }
    // Frame right before silence starts (topic conclusion)
    if (s.start > 1) {
      candidates.push({
        timestamp: s.start - 0.3,
        reason: "before_silence",
        priority: 3,
      });
    }
  }

  // 3. High word density segments (speaker emphasizing something)
  const wordDensityTimestamps = findHighDensityMoments(transcript.words, videoDuration);
  for (const ts of wordDensityTimestamps) {
    candidates.push({ timestamp: ts, reason: "high_density", priority: 2 });
  }

  // 4. Filler word clusters (potential cut points, useful to see visually)
  const fillerClusters = findFillerClusters(fillerWords);
  for (const ts of fillerClusters) {
    candidates.push({ timestamp: ts, reason: "filler_cluster", priority: 4 });
  }

  // 5. Baseline coverage: 1 frame every 10 seconds
  for (let t = 5; t < videoDuration - 3; t += 10) {
    candidates.push({ timestamp: t, reason: "baseline", priority: 5 });
  }

  // Deduplicate and sort
  return deduplicateAndCap(candidates, videoDuration);
}

/**
 * Find timestamps where word density is highest (fast talking = emphasis).
 * Uses a 3-second sliding window.
 */
function findHighDensityMoments(
  words: TranscriptionWord[],
  duration: number
): number[] {
  if (words.length < 10) return [];

  const windowSize = 3; // seconds
  const step = 1;
  let maxDensity = 0;
  const densities: Array<{ time: number; density: number }> = [];

  for (let t = 0; t < duration - windowSize; t += step) {
    const windowWords = words.filter(
      (w) => w.start >= t && w.end <= t + windowSize
    );
    const density = windowWords.length / windowSize;
    densities.push({ time: t + windowSize / 2, density });
    if (density > maxDensity) maxDensity = density;
  }

  if (maxDensity === 0) return [];

  // Pick moments above 80th percentile density
  const threshold = maxDensity * 0.8;
  const highDensity = densities
    .filter((d) => d.density >= threshold)
    .map((d) => d.time);

  // Take at most 3 high-density moments, spaced apart
  const selected: number[] = [];
  for (const t of highDensity) {
    if (selected.length >= 3) break;
    if (!selected.some((s) => Math.abs(s - t) < 5)) {
      selected.push(t);
    }
  }

  return selected;
}

/**
 * Find clusters of filler words (3+ fillers within 5 seconds).
 * Returns the midpoint timestamp of each cluster.
 */
function findFillerClusters(fillerWords: FillerWordDetection[]): number[] {
  if (fillerWords.length < 3) return [];

  const clusters: number[] = [];

  for (let i = 0; i < fillerWords.length - 2; i++) {
    const window = fillerWords.filter(
      (f) =>
        f.start >= fillerWords[i].start &&
        f.start <= fillerWords[i].start + 5
    );
    if (window.length >= 3) {
      const mid =
        (window[0].start + window[window.length - 1].end) / 2;
      if (!clusters.some((c) => Math.abs(c - mid) < 5)) {
        clusters.push(mid);
      }
    }
  }

  return clusters.slice(0, 2); // max 2 filler clusters
}

/**
 * Deduplicate candidates by timestamp proximity, sort by priority, cap at MAX_FRAMES.
 */
function deduplicateAndCap(
  candidates: FrameCandidate[],
  videoDuration: number
): number[] {
  // Sort by priority (most important first)
  const sorted = [...candidates].sort((a, b) => a.priority - b.priority);

  const selected: number[] = [];

  for (const c of sorted) {
    if (selected.length >= MAX_FRAMES) break;

    // Clamp to valid range
    const ts = Math.max(0.1, Math.min(c.timestamp, videoDuration - 0.1));

    // Skip if too close to an existing selection
    if (selected.some((s) => Math.abs(s - ts) < DEDUP_WINDOW)) continue;

    selected.push(ts);
  }

  // Sort chronologically for the final output
  selected.sort((a, b) => a - b);

  console.log(
    `[extract] Selected ${selected.length} transcript-aware timestamps from ${candidates.length} candidates`
  );

  return selected;
}

// ── Frame Extraction ──

export interface ExtractedFrame {
  timestamp: number;
  path: string;
  base64: string;
  transcriptContext: string; // what's being said at this moment
}

/**
 * Extract frames at specific timestamps and pair each with its transcript context.
 *
 * If Pass 1 provides keyFrameTimestamps, use those directly.
 * Otherwise, falls back to transcript-aware heuristic selection.
 */
export async function extractFramesAtTimestamps(
  inputPath: string,
  outputDir: string,
  timestamps: number[],
  transcript?: TranscriptionResult
): Promise<ExtractedFrame[]> {
  await mkdir(outputDir, { recursive: true });

  // Cap at MAX_FRAMES
  const capped = timestamps.slice(0, MAX_FRAMES);

  const results: ExtractedFrame[] = [];

  for (let i = 0; i < capped.length; i++) {
    const ts = capped[i];
    const outputPath = join(
      outputDir,
      `frame_${i.toString().padStart(4, "0")}.jpg`
    );

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .seekInput(ts)
          .frames(1)
          .videoFilter("scale=768:-1")
          .outputOptions(["-q:v", "5"])
          .output(outputPath)
          .on("end", () => resolve())
          .on("error", (err: Error) => reject(err))
          .run();
      });

      const buffer = await readFile(outputPath);
      const base64 = `data:image/jpeg;base64,${buffer.toString("base64")}`;

      // Find what's being said at this timestamp
      const context = transcript
        ? getTranscriptContext(transcript, ts)
        : "";

      results.push({ timestamp: ts, path: outputPath, base64, transcriptContext: context });
    } catch {
      console.log(
        `[extract] Failed to extract frame at ${ts.toFixed(2)}s, skipping`
      );
    }
  }

  console.log(
    `[extract] Extracted ${results.length}/${capped.length} frames`
  );
  return results;
}

/**
 * Get the transcript text surrounding a timestamp (+/- 3 seconds).
 */
function getTranscriptContext(
  transcript: TranscriptionResult,
  timestamp: number
): string {
  const window = 3;
  const contextWords = transcript.words.filter(
    (w) => w.start >= timestamp - window && w.end <= timestamp + window
  );
  if (contextWords.length === 0) return "(silence)";
  return contextWords.map((w) => w.word).join(" ");
}

// ── Legacy exports (kept for backward compat) ──

export async function framesToBase64(
  framePaths: string[]
): Promise<string[]> {
  const results: string[] = [];
  for (const fp of framePaths) {
    const buffer = await readFile(fp);
    results.push(`data:image/jpeg;base64,${buffer.toString("base64")}`);
  }
  return results;
}
