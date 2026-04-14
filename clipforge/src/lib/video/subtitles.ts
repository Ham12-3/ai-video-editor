import type { CaptionOperation } from "@/types/edl";

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
 * Generate a polished ASS subtitle file.
 *
 * Caption position at ~3/4 screen height (not the very bottom).
 * Bold font, thick outline, drop shadow, readable on any background.
 * Karaoke mode highlights each word as it's spoken.
 *
 * @param timeOffset - subtract from timestamps (for trim alignment)
 * @param trimEnd - only include words before this original time
 */
export function generateSubtitles(
  words: Word[],
  style: CaptionOperation,
  timeOffset: number = 0,
  trimEnd?: number
): string {
  // Filter and shift words to the trim window
  let filteredWords = words;
  if (timeOffset > 0 || trimEnd !== undefined) {
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

  const chunks = groupWords(filteredWords);

  const fontSize = resolveFontSize(style.fontSize || "large");
  const position = resolvePosition(style.position || "bottom-center");
  const primaryColor = hexToAssColor(style.fontColor || "#FFFFFF");
  const isKaraoke = (style.style || "").includes("karaoke");
  const isWordByWord = (style.style || "").includes("word");

  // Highlight color for karaoke (spoken word color)
  // Use a vibrant accent: yellow by default, or derive from fontColor
  const highlightColor = "&H00FFFF&"; // Yellow in BGR

  // Secondary color is the karaoke highlight fill color
  const secondaryColor = highlightColor;

  // Position: ASS uses MarginV from the alignment edge
  // Alignment 2 = bottom-center. For 3/4 height on a 1920px tall video:
  //   bottom margin = 1920 * 0.25 = 480px
  // Alignment 8 = top-center, margin from top
  // Alignment 5 = center, ignore margin
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
      // Position at ~3/4 from top = 1/4 from bottom = 480px margin from bottom
      alignment = 2;
      marginV = 480;
      break;
  }

  // Use extended fields with defaults
  const outline = style.outlineWidth ?? 4;
  const shadow = style.shadowDepth ?? 2;

  // Border style from the operation, or auto-detect from background
  const hasBgColor =
    style.backgroundColor &&
    style.backgroundColor !== "" &&
    style.backgroundColor !== "#00000000";

  let borderStyle: number;
  if (style.borderStyle === "none") {
    borderStyle = 1; // outline mode but with 0 outline below
  } else if (style.borderStyle === "box" || (hasBgColor && style.borderStyle !== "outline")) {
    borderStyle = 3; // opaque box
  } else {
    borderStyle = 1; // outline + shadow
  }

  const effectiveOutline = style.borderStyle === "none" ? 0 : outline;

  const bgColor = hasBgColor
    ? hexToAssColor(style.backgroundColor)
    : "&H80000000&";

  const outlineColor = hexToAssColor("#000000");

  const styleName = "Default";

  // Font from extended fields
  const fontName = style.fontFamily || "Arial Black";
  const isBold = (style.fontWeight ?? "bold") === "bold";

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
    `Style: ${styleName},${fontName},${fontSize},${primaryColor},${secondaryColor},${outlineColor},${bgColor},${isBold ? -1 : 0},0,0,0,100,100,1,0,${borderStyle},${effectiveOutline},${shadow},${alignment},40,40,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  // Build dialogue lines
  const dialogueLines: string[] = [];

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

  return [...header, ...dialogueLines, ""].join("\n");
}
