import type { CaptionOperation, HookOperation } from "@/types/edl";

interface Word {
  word: string;
  start: number;
  end: number;
}

interface SubtitleChunk {
  words: Word[];
  start: number;
  end: number;
  text: string;
}

// Fuzzy position mapping
function resolvePosition(pos: string): "bottom" | "top" | "center" {
  const p = pos.toLowerCase().replace(/[^a-z]/g, "");
  if (p.includes("top")) return "top";
  if (p.includes("center") || p.includes("middle")) return "center";
  return "bottom"; // default
}

// Fuzzy font size mapping
function resolveFontSize(size: string): number {
  const s = size.toLowerCase().replace(/[^a-z]/g, "");
  if (s.includes("small")) return 42;
  if (s.includes("medium")) return 56;
  if (s.includes("extra") || s.includes("xl")) return 80;
  if (s.includes("large")) return 68;
  return 62; // default
}

/**
 * Group words into display chunks of 2-4 words, max 2.0 seconds each.
 * Shorter chunks = more dynamic, more readable on mobile.
 */
function groupWords(words: Word[]): SubtitleChunk[] {
  const chunks: SubtitleChunk[] = [];
  let current: Word[] = [];

  for (const word of words) {
    current.push(word);
    const duration = word.end - current[0].start;
    if (current.length >= 3 || duration >= 2.0) {
      chunks.push({
        words: [...current],
        start: current[0].start,
        end: current[current.length - 1].end,
        text: current.map((w) => w.word).join(" "),
      });
      current = [];
    }
  }

  if (current.length > 0) {
    chunks.push({
      words: current,
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.word).join(" "),
    });
  }

  return chunks;
}

/**
 * Convert seconds to ASS timestamp: H:MM:SS.CC
 */
function assTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const cs = Math.floor((s % 1) * 100);
  const si = Math.floor(s);
  return `${h}:${m.toString().padStart(2, "0")}:${si.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

/**
 * Normalize a hex color string to a clean 6 or 8 char hex (no #).
 * Handles: #RGB, #RRGGBB, #RRGGBBAA, and versions without #.
 * Strips anything that isn't a hex digit.
 */
function normalizeHex(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  if (clean.length === 3) {
    // #RGB -> RRGGBB
    return clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  if (clean.length === 4) {
    // #RGBA -> RRGGBBAA
    return (
      clean[0] + clean[0] + clean[1] + clean[1] +
      clean[2] + clean[2] + clean[3] + clean[3]
    );
  }
  if (clean.length >= 6) {
    return clean.slice(0, Math.min(clean.length, 8));
  }
  return "FFFFFF";
}

/**
 * Convert #RRGGBB or #RRGGBBAA to ASS color format &HAABBGGRR&.
 *
 * ASS colors are &HAABBGGRR& where:
 *   AA = alpha (00 = opaque, FF = transparent) -- INVERTED from CSS
 *   BB = blue, GG = green, RR = red (BGR order, not RGB)
 *
 * If input has no alpha, defaults to 00 (fully opaque).
 */
export function hexToAssColor(hex: string): string {
  const clean = normalizeHex(hex);

  const r = clean.slice(0, 2).toUpperCase();
  const g = clean.slice(2, 4).toUpperCase();
  const b = clean.slice(4, 6).toUpperCase();

  let alpha = "00"; // default: fully opaque
  if (clean.length >= 8) {
    // Input alpha: 00 = transparent, FF = opaque (CSS convention)
    // ASS alpha: 00 = opaque, FF = transparent (inverted)
    const cssAlpha = parseInt(clean.slice(6, 8), 16);
    const assAlpha = 255 - cssAlpha;
    alpha = assAlpha.toString(16).padStart(2, "0").toUpperCase();
  }

  return `&H${alpha}${b}${g}${r}&`;
}

/**
 * Build karaoke dialogue with highlight effect.
 * Active word gets a different color via \1c override.
 */
function buildKaraokeDialogue(
  chunk: SubtitleChunk,
  styleName: string,
  highlightColor: string
): string {
  const parts: string[] = [];

  for (const word of chunk.words) {
    const durationCs = Math.max(1, Math.round((word.end - word.start) * 100));
    // \kf = smooth fill karaoke, highlight color applied progressively
    parts.push(`{\\kf${durationCs}}${word.word} `);
  }

  return `Dialogue: 0,${assTime(chunk.start)},${assTime(chunk.end)},${styleName},,0,0,0,,${parts.join("").trim()}`;
}

/**
 * Build word-by-word dialogue where each word appears separately.
 */
function buildWordByWordDialogue(
  chunk: SubtitleChunk,
  styleName: string
): string[] {
  return chunk.words.map((word) => {
    const start = assTime(word.start);
    const end = assTime(word.end);
    // Pop-in effect: scale up slightly then normalize
    return `Dialogue: 0,${start},${end},${styleName},,0,0,0,,{\\fscx110\\fscy110\\t(0,80,\\fscx100\\fscy100)}${word.word.toUpperCase()}`;
  });
}

/**
 * Build standard sentence dialogue.
 */
function buildStandardDialogue(
  chunk: SubtitleChunk,
  styleName: string
): string {
  // Fade in/out for polish
  return `Dialogue: 0,${assTime(chunk.start)},${assTime(chunk.end)},${styleName},,0,0,0,,{\\fad(120,80)}${chunk.text}`;
}

/**
 * Apply timeline adjustments for silence removal or speed changes.
 */
export function adjustTimeline(
  words: Word[],
  removedSegments: Array<{ start: number; end: number }>,
  speedSegments: Array<{ start: number; end: number; factor: number }>
): Word[] {
  let adjusted = [...words];

  adjusted = adjusted.filter((w) => {
    return !removedSegments.some(
      (seg) => w.start >= seg.start && w.end <= seg.end
    );
  });

  for (const seg of removedSegments.sort((a, b) => a.start - b.start)) {
    const removedDuration = seg.end - seg.start;
    adjusted = adjusted.map((w) => {
      if (w.start > seg.end) {
        return { ...w, start: w.start - removedDuration, end: w.end - removedDuration };
      }
      return w;
    });
  }

  for (const seg of speedSegments) {
    adjusted = adjusted.map((w) => {
      if (w.start >= seg.start && w.end <= seg.end) {
        const offset = w.start - seg.start;
        const duration = w.end - w.start;
        return {
          ...w,
          start: seg.start + offset / seg.factor,
          end: seg.start + (offset + duration) / seg.factor,
        };
      }
      return w;
    });
  }

  return adjusted;
}

/**
 * Build the style + dialogue lines for a top-pinned hook banner
 * (TikTok-style "Stop wasting tokens" header).
 *
 * Returns { styleLine, dialogueLines } so the caller can stitch them into
 * the [V4+ Styles] and [Events] sections of the ASS file.
 */
function buildHookStyleAndDialogue(
  hook: HookOperation,
  outputDurationSec: number
): { styleLine: string; dialogueLines: string[] } {
  const text = (hook.text || "").trim();
  if (!text || outputDurationSec <= 0) {
    return { styleLine: "", dialogueLines: [] };
  }

  // Typography: bold sans, tight uppercase for "outline", natural case for "highlight"
  const displayText =
    hook.style === "highlight" ? text : text.toUpperCase();

  // Colors
  // outline variant: yellow fill + thick black stroke (no bg)
  // highlight variant: yellow box bg + black text
  const primary = hook.style === "highlight"
    ? hexToAssColor("#1A1A1A")
    : hexToAssColor("#FFEB3B");
  const outline = hook.style === "highlight"
    ? hexToAssColor("#1A1A1A") // no-op, box mode ignores outline
    : hexToAssColor("#000000");
  const back = hook.style === "highlight"
    ? hexToAssColor("#FFEB3B")
    : hexToAssColor("#00000000");

  // Border style: 1 = outline+shadow, 3 = opaque box
  const borderStyle = hook.style === "highlight" ? 3 : 1;
  const outlineWidth = hook.style === "highlight" ? 0 : 6;
  const shadow = hook.style === "highlight" ? 0 : 2;

  // Alignment 8 = top-center, MarginV = distance from top in pixels at 1080x1920
  const alignment = 8;
  const marginV = 150;

  const styleLine =
    `Style: Hook,Arial Black,72,${primary},${primary},${outline},${back},-1,0,0,0,100,100,2,0,${borderStyle},${outlineWidth},${shadow},${alignment},40,40,${marginV},1`;

  // Gentle pop-in: slight scale up then settle, plus fade in.
  const startTag = `{\\fad(250,0)\\fscx105\\fscy105\\t(0,200,\\fscx100\\fscy100)}`;
  const dialogueLine =
    `Dialogue: 0,${assTime(0)},${assTime(outputDurationSec)},Hook,,0,0,0,,${startTag}${displayText}`;

  return {
    styleLine,
    dialogueLines: [dialogueLine],
  };
}

/**
 * Generate a polished ASS subtitle file.
 *
 * Caption position at ~3/4 screen height (not the very bottom).
 * Bold font, thick outline, drop shadow, readable on any background.
 * Karaoke mode highlights each word as it's spoken.
 *
 * Optionally includes a top-pinned hook banner (HookOperation) spanning the full
 * output duration. Hook uses its own "Hook" style in the ASS file, so captions
 * and hook coexist without interfering.
 *
 * Returns null if there's nothing to render (no caption + no hook).
 *
 * @param words - word-level timestamps from Whisper
 * @param caption - optional caption op; if null, no per-word subtitles are rendered
 * @param timeOffset - subtract from timestamps (for trim alignment)
 * @param trimEnd - only include words before this original time
 * @param hook - optional hook banner
 * @param outputDuration - full output duration in seconds (needed for hook timing)
 */
export function generateSubtitles(
  words: Word[],
  caption: CaptionOperation | null,
  timeOffset: number = 0,
  trimEnd?: number,
  hook?: HookOperation,
  outputDuration?: number
): string | null {
  const hasCaption = !!caption;
  const hasHook =
    !!hook && !!hook.text?.trim() && (outputDuration ?? 0) > 0;

  if (!hasCaption && !hasHook) return null;

  // Filter and shift words to the trim window (only matters for captions)
  let filteredWords = words;
  if (hasCaption && (timeOffset > 0 || trimEnd !== undefined)) {
    filteredWords = words
      .filter((w) => {
        if (w.end <= timeOffset) return false;
        if (trimEnd !== undefined && w.start >= trimEnd) return false;
        return true;
      })
      .map((w) => ({
        ...w,
        start: Math.max(0, w.start - timeOffset),
        end: w.end - timeOffset,
      }));
  }

  // Build caption style if present
  const styleLines: string[] = [];
  const dialogueLines: string[] = [];

  if (hasCaption && caption) {
    const chunks = groupWords(filteredWords);

    const fontSize = resolveFontSize(caption.fontSize || "large");
    const position = resolvePosition(caption.position || "bottom-center");
    const primaryColor = hexToAssColor(caption.fontColor || "#FFFFFF");
    const isKaraoke = (caption.style || "").includes("karaoke");
    const isWordByWord = (caption.style || "").includes("word");

    const highlightColor = "&H00FFFF&"; // Yellow in BGR
    const secondaryColor = highlightColor;

    let alignment: number;
    let marginV: number;
    switch (position) {
      case "top":
        alignment = 8;
        marginV = 200;
        break;
      case "center":
        alignment = 5;
        marginV = 0;
        break;
      case "bottom":
      default:
        alignment = 2;
        marginV = 480;
        break;
    }

    const outline = caption.outlineWidth ?? 4;
    const shadow = caption.shadowDepth ?? 2;

    const hasBgColor =
      caption.backgroundColor &&
      caption.backgroundColor !== "" &&
      caption.backgroundColor !== "#00000000";

    let borderStyle: number;
    if (caption.borderStyle === "none") {
      borderStyle = 1;
    } else if (caption.borderStyle === "box" || (hasBgColor && caption.borderStyle !== "outline")) {
      borderStyle = 3;
    } else {
      borderStyle = 1;
    }

    const effectiveOutline = caption.borderStyle === "none" ? 0 : outline;
    const bgColor = hasBgColor
      ? hexToAssColor(caption.backgroundColor)
      : "&H80000000&";
    const outlineColor = hexToAssColor("#000000");

    const styleName = "Default";
    const fontName = caption.fontFamily || "Arial Black";
    const isBold = (caption.fontWeight ?? "bold") === "bold";

    styleLines.push(
      `Style: ${styleName},${fontName},${fontSize},${primaryColor},${secondaryColor},${outlineColor},${bgColor},${isBold ? -1 : 0},0,0,0,100,100,1,0,${borderStyle},${effectiveOutline},${shadow},${alignment},40,40,${marginV},1`
    );

    for (const chunk of chunks) {
      if (isKaraoke) {
        dialogueLines.push(
          buildKaraokeDialogue(chunk, styleName, highlightColor)
        );
      } else if (isWordByWord) {
        dialogueLines.push(...buildWordByWordDialogue(chunk, styleName));
      } else {
        dialogueLines.push(buildStandardDialogue(chunk, styleName));
      }
    }
  }

  // Build hook style + dialogue if present
  if (hasHook && hook && outputDuration) {
    const { styleLine, dialogueLines: hookLines } = buildHookStyleAndDialogue(
      hook,
      outputDuration
    );
    if (styleLine) styleLines.push(styleLine);
    dialogueLines.push(...hookLines);
  }

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styleLines,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  return [...header, ...dialogueLines, ""].join("\n");
}
