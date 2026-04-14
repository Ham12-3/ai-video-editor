import { describe, it, expect } from "vitest";
import { alignTranscripts } from "../transcribe";
import type { TranscriptionResult } from "../transcribe";

function makeWhisperResult(
  segments: Array<{ text: string; start: number; end: number }>,
  words: Array<{ word: string; start: number; end: number }>
): TranscriptionResult {
  return {
    text: segments.map((s) => s.text).join(" "),
    segments: segments.map((s, i) => ({ id: i, ...s })),
    words,
    duration: segments[segments.length - 1]?.end ?? 0,
    language: "en",
  };
}

describe("alignTranscripts", () => {
  it("swaps text when word count matches exactly", () => {
    const whisper = makeWhisperResult(
      [{ text: "hello wrold", start: 0, end: 2 }],
      [
        { word: "hello", start: 0, end: 1 },
        { word: "wrold", start: 1, end: 2 },
      ]
    );

    const result = alignTranscripts(whisper, "hello world");

    expect(result.words[0].word).toBe("hello");
    expect(result.words[1].word).toBe("world");
    // Timestamps preserved exactly
    expect(result.words[0].start).toBe(0);
    expect(result.words[0].end).toBe(1);
    expect(result.words[1].start).toBe(1);
    expect(result.words[1].end).toBe(2);
  });

  it("redistributes timestamps when enhanced has more words", () => {
    const whisper = makeWhisperResult(
      [{ text: "gonna do it", start: 0, end: 3 }],
      [
        { word: "gonna", start: 0, end: 1 },
        { word: "do", start: 1, end: 2 },
        { word: "it", start: 2, end: 3 },
      ]
    );

    const result = alignTranscripts(whisper, "going to do it");

    // Should have 4 words now, redistributed across 0-3s
    expect(result.words.length).toBe(4);
    expect(result.words[0].word).toBe("going");
    expect(result.words[0].start).toBe(0);
    expect(result.words[result.words.length - 1].end).toBe(3);
  });

  it("redistributes timestamps when enhanced has fewer words", () => {
    const whisper = makeWhisperResult(
      [{ text: "it is not", start: 5, end: 8 }],
      [
        { word: "it", start: 5, end: 6 },
        { word: "is", start: 6, end: 7 },
        { word: "not", start: 7, end: 8 },
      ]
    );

    const result = alignTranscripts(whisper, "it's not");

    expect(result.words.length).toBe(2);
    expect(result.words[0].start).toBe(5);
    expect(result.words[result.words.length - 1].end).toBe(8);
  });

  it("falls back to whisper when alignment confidence is low", () => {
    const whisper = makeWhisperResult(
      [{ text: "hello world", start: 0, end: 2 }],
      [
        { word: "hello", start: 0, end: 1 },
        { word: "world", start: 1, end: 2 },
      ]
    );

    // Completely different text, should fall back
    const result = alignTranscripts(whisper, "abcdef ghijkl mnopqr stuvwx");

    expect(result.words[0].word).toBe("hello");
    expect(result.words[1].word).toBe("world");
  });

  it("handles multiple segments with distinct content", () => {
    const whisper = makeWhisperResult(
      [
        { text: "hello there", start: 0, end: 2 },
        { text: "goodbye now", start: 3, end: 5 },
      ],
      [
        { word: "hello", start: 0, end: 1 },
        { word: "there", start: 1, end: 2 },
        { word: "goodbye", start: 3, end: 4 },
        { word: "now", start: 4, end: 5 },
      ]
    );

    const result = alignTranscripts(
      whisper,
      "hello there goodbye now"
    );

    // Both segments should align, preserving 4 words total
    expect(result.words.length).toBeGreaterThanOrEqual(4);
    expect(result.words[0].word).toBe("hello");
    expect(result.words[0].start).toBe(0);
  });

  it("preserves duration and language", () => {
    const whisper = makeWhisperResult(
      [{ text: "test", start: 0, end: 1 }],
      [{ word: "test", start: 0, end: 1 }]
    );
    whisper.duration = 10;
    whisper.language = "fr";

    const result = alignTranscripts(whisper, "test");

    expect(result.duration).toBe(10);
    expect(result.language).toBe("fr");
  });

  it("handles empty enhanced text gracefully", () => {
    const whisper = makeWhisperResult(
      [{ text: "hello", start: 0, end: 1 }],
      [{ word: "hello", start: 0, end: 1 }]
    );

    const result = alignTranscripts(whisper, "");

    // Should fall back to whisper for all segments
    expect(result.words[0].word).toBe("hello");
  });
});
