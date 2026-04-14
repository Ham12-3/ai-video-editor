import "server-only";
import OpenAI from "openai";
import { createReadStream } from "fs";

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  words: TranscriptionWord[];
  duration: number;
  language: string;
}

const FILLER_WORDS = [
  "um",
  "uh",
  "like",
  "you know",
  "basically",
  "actually",
  "so",
  "right",
];

export interface FillerWordDetection {
  word: string;
  start: number;
  end: number;
}

const HYBRID_ENABLED = process.env.ENABLE_HYBRID_TRANSCRIPTION === "true";

// ── Whisper-1 (timestamps) ──

async function runWhisper(
  audioPath: string,
  client: OpenAI
): Promise<TranscriptionResult> {
  const response = await client.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
  });

  const result = response as unknown as {
    text: string;
    segments?: TranscriptionSegment[];
    words?: TranscriptionWord[];
    duration?: number;
    language?: string;
  };

  return {
    text: result.text,
    segments: result.segments ?? [],
    words: result.words ?? [],
    duration: result.duration ?? 0,
    language: result.language ?? "en",
  };
}

// ── gpt-4o-mini-transcribe (accuracy, no timestamps) ──

async function runGpt4oMiniTranscribe(
  audioPath: string,
  client: OpenAI
): Promise<string> {
  const response = await client.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: "gpt-4o-mini-transcribe",
    response_format: "text",
  });

  // The response is the text string directly
  return typeof response === "string"
    ? response
    : (response as unknown as { text: string }).text ?? "";
}

// ── Alignment ──

/**
 * Normalize text for comparison: lowercase, strip punctuation, collapse whitespace.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split text into words, preserving the original form.
 */
function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Find the best matching portion of enhancedText for a given whisper segment.
 * Uses normalized word overlap scoring.
 */
function findSegmentMatch(
  segmentText: string,
  enhancedWords: string[],
  searchStart: number
): { matchStart: number; matchEnd: number; confidence: number } {
  const segWords = splitWords(normalize(segmentText));
  if (segWords.length === 0) {
    return { matchStart: searchStart, matchEnd: searchStart, confidence: 0 };
  }

  // Sliding window: try to find the best overlap
  let bestStart = searchStart;
  let bestEnd = searchStart + segWords.length;
  let bestScore = 0;

  const windowSize = segWords.length;
  // Search a wider window to handle word count differences
  const searchEnd = Math.min(enhancedWords.length, searchStart + windowSize * 4 + 5);

  for (let i = searchStart; i < searchEnd; i++) {
    // Try different candidate lengths (original +/- 3 words)
    for (let len = Math.max(1, windowSize - 2); len <= windowSize + 2; len++) {
      if (i + len > enhancedWords.length) continue;

      let matches = 0;
      const candidateWords = enhancedWords.slice(i, i + len).map(normalize);
      const candidateText = candidateWords.join(" ");

      // Score by checking how many segment words appear in the candidate
      for (const sw of segWords) {
        if (
          candidateWords.some(
            (cw) => cw === sw || cw.includes(sw) || sw.includes(cw)
          ) ||
          candidateText.includes(sw)
        ) {
          matches++;
        }
      }

      const score = matches / segWords.length;
      // Prefer higher score. On tie, prefer longer match (captures more enhanced text).
      if (
        score > bestScore ||
        (score === bestScore && len > bestEnd - bestStart)
      ) {
        bestScore = score;
        bestStart = i;
        bestEnd = i + len;
      }
    }
  }

  return { matchStart: bestStart, matchEnd: bestEnd, confidence: bestScore };
}

/**
 * Find the end index for roughly N words starting at position start.
 * Accounts for enhanced text potentially having more or fewer words.
 */
function findWordBoundary(
  words: string[],
  start: number,
  targetCount: number
): number {
  // Allow +/- 2 words from the target
  return Math.min(words.length, start + targetCount + 1);
}

/**
 * Redistribute timestamps across a different number of words.
 * Allocates time proportionally to word length (longer words get more time).
 */
function redistributeTimestamps(
  newWords: string[],
  segStart: number,
  segEnd: number
): TranscriptionWord[] {
  if (newWords.length === 0) return [];

  const totalDuration = segEnd - segStart;
  const totalChars = newWords.reduce((sum, w) => sum + Math.max(w.length, 1), 0);

  const result: TranscriptionWord[] = [];
  let cursor = segStart;

  for (let i = 0; i < newWords.length; i++) {
    const charWeight = Math.max(newWords[i].length, 1) / totalChars;
    const wordDuration = totalDuration * charWeight;
    const wordStart = cursor;
    const wordEnd = i === newWords.length - 1
      ? segEnd // last word gets remaining time
      : cursor + wordDuration;

    result.push({
      word: newWords[i],
      start: Math.round(wordStart * 1000) / 1000,
      end: Math.round(wordEnd * 1000) / 1000,
    });

    cursor = wordEnd;
  }

  return result;
}

/**
 * Align enhanced text against whisper timestamps using segment anchors.
 *
 * Strategy:
 * - Use whisper segments as anchor points (they have reliable start/end times)
 * - For each segment, find the corresponding text in the enhanced output
 * - Replace whisper words with enhanced words, keeping whisper timing
 * - If alignment confidence is low for a segment, keep whisper's original words
 */
export function alignTranscripts(
  whisper: TranscriptionResult,
  enhancedText: string
): TranscriptionResult {
  const enhancedWords = splitWords(enhancedText);
  const alignedWords: TranscriptionWord[] = [];
  let enhancedCursor = 0;
  let fallbackCount = 0;

  for (const segment of whisper.segments) {
    const segText = segment.text.trim();
    if (!segText) continue;

    const whisperSegWords = whisper.words.filter(
      (w) => w.start >= segment.start - 0.05 && w.end <= segment.end + 0.05
    );

    // Try to find matching enhanced text
    const match = findSegmentMatch(segText, enhancedWords, enhancedCursor);

    if (match.confidence >= 0.3 && match.matchEnd > match.matchStart) {
      // Good match: use enhanced words with redistributed timestamps
      const enhancedSlice = enhancedWords.slice(match.matchStart, match.matchEnd);

      if (enhancedSlice.length === whisperSegWords.length) {
        // Same word count: swap text, keep timestamps exactly
        for (let i = 0; i < whisperSegWords.length; i++) {
          alignedWords.push({
            word: enhancedSlice[i],
            start: whisperSegWords[i].start,
            end: whisperSegWords[i].end,
          });
        }
      } else {
        // Different word count: redistribute timestamps proportionally
        const redistributed = redistributeTimestamps(
          enhancedSlice,
          segment.start,
          segment.end
        );
        alignedWords.push(...redistributed);
      }

      enhancedCursor = match.matchEnd;
    } else {
      // Low confidence: fall back to whisper words
      fallbackCount++;
      alignedWords.push(...whisperSegWords);
      // Still advance cursor roughly
      enhancedCursor = Math.min(
        enhancedWords.length,
        enhancedCursor + whisperSegWords.length
      );
    }
  }

  const totalSegments = whisper.segments.length;
  const alignedCount = totalSegments - fallbackCount;
  console.log(
    `[transcribe:align] Aligned ${alignedCount}/${totalSegments} segments (${fallbackCount} fell back to whisper)`
  );

  // Rebuild full text from aligned words
  const alignedText = alignedWords.map((w) => w.word).join(" ");

  // Rebuild segments with updated text
  const alignedSegments = whisper.segments.map((seg) => {
    const segWords = alignedWords.filter(
      (w) => w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05
    );
    return {
      ...seg,
      text: segWords.map((w) => w.word).join(" "),
    };
  });

  return {
    text: alignedText,
    segments: alignedSegments,
    words: alignedWords,
    duration: whisper.duration,
    language: whisper.language,
  };
}

// ── Public API ──

/**
 * Transcribe audio. Uses hybrid mode if ENABLE_HYBRID_TRANSCRIPTION=true.
 */
export async function transcribeAudio(
  audioPath: string,
  apiKey: string
): Promise<TranscriptionResult> {
  const client = new OpenAI({ apiKey });

  // Always run whisper-1 first (we need its timestamps)
  console.log(`[transcribe] Running whisper-1...`);
  const whisperResult = await runWhisper(audioPath, client);
  console.log(
    `[transcribe] Whisper: ${whisperResult.words.length} words, ${whisperResult.segments.length} segments`
  );

  if (!HYBRID_ENABLED) {
    return whisperResult;
  }

  // Hybrid mode: also run gpt-4o-mini-transcribe for better text
  console.log(`[transcribe] Hybrid mode: running gpt-4o-mini-transcribe...`);

  try {
    const enhancedText = await runGpt4oMiniTranscribe(audioPath, client);
    console.log(
      `[transcribe] Enhanced text: ${splitWords(enhancedText).length} words`
    );

    if (!enhancedText.trim()) {
      console.log(`[transcribe] Enhanced text empty, using whisper only`);
      return whisperResult;
    }

    const aligned = alignTranscripts(whisperResult, enhancedText);
    console.log(
      `[transcribe] Hybrid result: ${aligned.words.length} words`
    );
    return aligned;
  } catch (err) {
    console.log(
      `[transcribe] gpt-4o-mini-transcribe failed, falling back to whisper:`,
      err instanceof Error ? err.message : err
    );
    return whisperResult;
  }
}

/**
 * Detect filler words from word-level timestamps.
 */
export function detectFillerWords(
  words: TranscriptionWord[]
): FillerWordDetection[] {
  const detections: FillerWordDetection[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const normalized = w.word.toLowerCase().trim().replace(/[.,!?]/g, "");

    if (FILLER_WORDS.includes(normalized)) {
      detections.push({ word: normalized, start: w.start, end: w.end });
      continue;
    }

    if (i < words.length - 1) {
      const next = words[i + 1];
      const twoWord =
        normalized +
        " " +
        next.word.toLowerCase().trim().replace(/[.,!?]/g, "");
      if (FILLER_WORDS.includes(twoWord)) {
        detections.push({ word: twoWord, start: w.start, end: next.end });
      }
    }
  }

  return detections;
}
