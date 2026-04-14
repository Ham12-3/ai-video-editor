"use client";

import type { CaptionOperation } from "@/types/edl";
import { cn } from "@/lib/utils";

const FONT_OPTIONS = [
  "Arial Black",
  "Arial",
  "Inter",
  "Roboto",
  "Montserrat",
  "Impact",
  "Georgia",
  "Courier New",
];

const STYLE_OPTIONS: Array<{ value: CaptionOperation["style"]; label: string }> = [
  { value: "karaoke", label: "Karaoke" },
  { value: "word-by-word", label: "Word by word" },
  { value: "sentence", label: "Sentence" },
  { value: "minimal", label: "Minimal" },
];

const SIZE_OPTIONS = ["small", "medium", "large"] as const;

const POSITION_OPTIONS: Array<{ value: CaptionOperation["position"]; label: string }> = [
  { value: "top-center", label: "Top" },
  { value: "center", label: "Middle" },
  { value: "bottom-center", label: "Bottom" },
];

const BORDER_OPTIONS = ["outline", "box", "none"] as const;

const COLOR_PRESETS = [
  { color: "#FFFFFF", label: "White" },
  { color: "#FFEB3B", label: "Yellow" },
  { color: "#F3EBE2", label: "Linen" },
  { color: "#1A1A1A", label: "Black" },
  { color: "#B03E16", label: "Rust" },
  { color: "#3D3D3D", label: "Graphite" },
];

const BG_PRESETS = [
  { color: "#000000C0", label: "Dark" },
  { color: "#000000FF", label: "Solid" },
  { color: "#1A1A1A", label: "Near-black" },
  { color: "#00000000", label: "None" },
];

function normalizePosition(pos: string): CaptionOperation["position"] {
  const p = (pos || "").toLowerCase();
  if (p.includes("top")) return "top-center";
  if (p.includes("center") && !p.includes("bottom")) return "center";
  return "bottom-center";
}

function normalizeFontSize(size: string): CaptionOperation["fontSize"] {
  const s = (size || "").toLowerCase();
  if (s.includes("small")) return "small";
  if (s.includes("large") || s.includes("xl") || s.includes("extra")) return "large";
  return "medium";
}

function normalizeStyle(style: string): CaptionOperation["style"] {
  const s = (style || "").toLowerCase();
  if (s.includes("karaoke")) return "karaoke";
  if (s.includes("word")) return "word-by-word";
  if (s.includes("minimal")) return "minimal";
  return "sentence";
}

interface CaptionSettingsProps {
  caption: CaptionOperation;
  onChange: (updated: CaptionOperation) => void;
}

export function CaptionSettings({ caption, onChange }: CaptionSettingsProps) {
  const currentStyle = normalizeStyle(caption.style);
  const currentSize = normalizeFontSize(caption.fontSize);
  const currentPosition = normalizePosition(caption.position);
  const currentFont = caption.fontFamily || "Arial Black";
  const currentWeight = caption.fontWeight ?? "bold";
  const currentBorder = caption.borderStyle ?? "outline";
  const currentOutline = caption.outlineWidth ?? 4;
  const currentFontColor = caption.fontColor || "#FFFFFF";
  const currentBgColor = caption.backgroundColor || "#000000C0";

  const update = (partial: Partial<CaptionOperation>) => {
    onChange({ ...caption, ...partial });
  };

  const previewFontSize = currentSize === "small" ? 18 : currentSize === "large" ? 32 : 24;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <h3 className="font-heading text-[24px] tracking-[-0.015em] leading-tight">
          Caption settings
        </h3>
        <span className="tag">Applied on render</span>
      </div>

      {/* Live preview */}
      <div className="bg-surface-inverse flex items-center justify-center min-h-[120px] p-8">
        <span
          style={{
            fontFamily: currentFont,
            fontSize: previewFontSize,
            fontWeight: currentWeight === "bold" ? 700 : 400,
            color: currentFontColor,
            textShadow:
              currentBorder === "none"
                ? "none"
                : `0 0 ${currentOutline}px #000, 2px 2px 2px #000`,
            backgroundColor: currentBorder === "box" ? currentBgColor : "transparent",
            padding: currentBorder === "box" ? "6px 14px" : "0",
            WebkitTextStroke:
              currentBorder === "outline"
                ? `${Math.min(currentOutline, 2)}px black`
                : "none",
          }}
        >
          Sample caption text
        </span>
      </div>

      {/* Style */}
      <Row label="Style">
        <OptionGroup
          options={STYLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={currentStyle}
          onChange={(v) => update({ style: v as CaptionOperation["style"] })}
        />
      </Row>

      {/* Font */}
      <Row label="Font family">
        <select
          className="w-full px-3.5 py-2.5 text-sm bg-background border border-border focus:border-foreground focus:outline-none"
          value={currentFont}
          onChange={(e) => update({ fontFamily: e.target.value })}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
      </Row>

      {/* Size + weight */}
      <div className="grid grid-cols-2 gap-6">
        <Row label="Size">
          <OptionGroup
            options={SIZE_OPTIONS.map((s) => ({
              value: s,
              label: s === "small" ? "S" : s === "medium" ? "M" : "L",
            }))}
            value={currentSize}
            onChange={(v) => update({ fontSize: v as CaptionOperation["fontSize"] })}
          />
        </Row>
        <Row label="Weight">
          <OptionGroup
            options={[
              { value: "bold", label: "Bold" },
              { value: "normal", label: "Normal" },
            ]}
            value={currentWeight}
            onChange={(v) => update({ fontWeight: v as "bold" | "normal" })}
          />
        </Row>
      </div>

      {/* Position */}
      <Row label="Position">
        <OptionGroup
          options={POSITION_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
          value={currentPosition}
          onChange={(v) => update({ position: v as CaptionOperation["position"] })}
        />
      </Row>

      <div className="h-px bg-border" />

      {/* Text colour */}
      <Row label="Text colour">
        <div className="flex items-center gap-2.5 flex-wrap">
          {COLOR_PRESETS.map((p) => (
            <button
              type="button"
              key={p.color}
              className={cn(
                "w-7 h-7 transition-all",
                currentFontColor.toUpperCase() === p.color.toUpperCase()
                  ? "ring-2 ring-offset-2 ring-offset-background ring-foreground"
                  : "border border-border hover:ring-1 hover:ring-foreground/30"
              )}
              style={{ backgroundColor: p.color }}
              onClick={() => update({ fontColor: p.color })}
              title={p.label}
              aria-label={`Use ${p.label}`}
            />
          ))}
          <label className="ml-2 flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <input
              type="color"
              value={currentFontColor.slice(0, 7)}
              onChange={(e) => update({ fontColor: e.target.value.toUpperCase() })}
              className="w-7 h-7 p-0 border border-border bg-transparent cursor-pointer"
            />
            Custom
          </label>
        </div>
      </Row>

      {/* Background */}
      <Row label="Background">
        <OptionGroup
          options={BG_PRESETS.map((p) => ({ value: p.color, label: p.label }))}
          value={currentBgColor}
          onChange={(v) => update({ backgroundColor: v })}
        />
      </Row>

      <div className="h-px bg-border" />

      {/* Border style */}
      <Row label="Border">
        <OptionGroup
          options={BORDER_OPTIONS.map((o) => ({
            value: o,
            label: o.charAt(0).toUpperCase() + o.slice(1),
          }))}
          value={currentBorder}
          onChange={(v) => update({ borderStyle: v as CaptionOperation["borderStyle"] })}
        />
      </Row>

      {/* Outline width */}
      {currentBorder === "outline" && (
        <Row label={`Outline · ${currentOutline}px`}>
          <input
            type="range"
            min={0}
            max={8}
            step={1}
            value={currentOutline}
            onChange={(e) => update({ outlineWidth: parseInt(e.target.value) })}
            className="w-full accent-foreground"
          />
        </Row>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="tag">{label}</span>
      {children}
    </div>
  );
}

function OptionGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-0 border border-border">
      {options.map((opt, i) => {
        const isActive = opt.value === value;
        return (
          <button
            type="button"
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 px-3 py-2 text-[13px] transition-colors whitespace-nowrap",
              i > 0 && "border-l border-border",
              isActive
                ? "bg-foreground text-foreground-inverse font-medium"
                : "bg-background hover:bg-muted"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
