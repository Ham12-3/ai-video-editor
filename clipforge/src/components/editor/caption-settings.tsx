"use client";

import type { CaptionOperation } from "@/types/edl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Type } from "lucide-react";

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
  { value: "center", label: "Center" },
  { value: "bottom-center", label: "Bottom" },
];

const BORDER_OPTIONS = ["outline", "box", "none"] as const;

const COLOR_PRESETS = [
  { color: "#FFFFFF", label: "White" },
  { color: "#FFFF00", label: "Yellow" },
  { color: "#00FFFF", label: "Cyan" },
  { color: "#FF6B6B", label: "Red" },
  { color: "#4ECDC4", label: "Teal" },
  { color: "#FF69B4", label: "Pink" },
];

const BG_PRESETS = [
  { color: "#000000C0", label: "Dark" },
  { color: "#000000FF", label: "Solid" },
  { color: "#00000000", label: "None" },
  { color: "#000000A0", label: "Semi" },
];

/**
 * Normalize the AI's position value to our strict type.
 * AI might return "bottom", "bottom-center", "top", etc.
 */
function normalizePosition(pos: string): CaptionOperation["position"] {
  const p = (pos || "").toLowerCase();
  if (p.includes("top")) return "top-center";
  if (p.includes("center") && !p.includes("bottom")) return "center";
  return "bottom-center";
}

/**
 * Normalize font size. AI might return "extra-large", "xl", etc.
 */
function normalizeFontSize(size: string): CaptionOperation["fontSize"] {
  const s = (size || "").toLowerCase();
  if (s.includes("small")) return "small";
  if (s.includes("large") || s.includes("xl") || s.includes("extra")) return "large";
  return "medium";
}

/**
 * Normalize caption style.
 */
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
  // Normalize AI values so buttons show the right selection
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

  const previewFontSize = currentSize === "small" ? 18 : currentSize === "large" ? 30 : 24;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Type className="h-4 w-4 text-primary" />
          Caption Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Live preview */}
        <div
          className="rounded-lg p-6 flex items-center justify-center min-h-[80px]"
          style={{ backgroundColor: "#18181b" }}
        >
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
              backgroundColor:
                currentBorder === "box" ? currentBgColor : "transparent",
              padding: currentBorder === "box" ? "4px 12px" : "0",
              borderRadius: currentBorder === "box" ? "4px" : "0",
              WebkitTextStroke:
                currentBorder === "outline"
                  ? `${Math.min(currentOutline, 2)}px black`
                  : "none",
            }}
          >
            Sample Caption Text
          </span>
        </div>

        {/* Caption style */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Style</Label>
          <div className="flex gap-1.5">
            {STYLE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={currentStyle === opt.value ? "default" : "outline"}
                size="sm"
                className="text-xs flex-1"
                onClick={() => update({ style: opt.value })}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Font family */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Font</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={currentFont}
            onChange={(e) => update({ fontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Font size */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Size</Label>
            <div className="flex gap-1">
              {SIZE_OPTIONS.map((size) => (
                <Button
                  key={size}
                  variant={currentSize === size ? "default" : "outline"}
                  size="sm"
                  className="text-xs flex-1"
                  onClick={() => update({ fontSize: size })}
                >
                  {size === "small" ? "S" : size === "medium" ? "M" : "L"}
                </Button>
              ))}
            </div>
          </div>

          {/* Font weight */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Weight</Label>
            <div className="flex gap-1">
              <Button
                variant={currentWeight === "bold" ? "default" : "outline"}
                size="sm"
                className="text-xs flex-1"
                onClick={() => update({ fontWeight: "bold" })}
              >
                Bold
              </Button>
              <Button
                variant={currentWeight === "normal" ? "default" : "outline"}
                size="sm"
                className="text-xs flex-1"
                onClick={() => update({ fontWeight: "normal" })}
              >
                Normal
              </Button>
            </div>
          </div>
        </div>

        {/* Position */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Position</Label>
          <div className="flex gap-1.5">
            {POSITION_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={currentPosition === opt.value ? "default" : "outline"}
                size="sm"
                className="text-xs flex-1"
                onClick={() => update({ position: opt.value })}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Font color */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Text color</Label>
          <div className="flex gap-2 items-center">
            {COLOR_PRESETS.map((p) => (
              <button
                key={p.color}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  currentFontColor.toUpperCase() === p.color
                    ? "border-primary scale-110"
                    : "border-border"
                }`}
                style={{ backgroundColor: p.color }}
                onClick={() => update({ fontColor: p.color })}
                title={p.label}
              />
            ))}
            <Input
              type="color"
              value={currentFontColor.slice(0, 7)}
              onChange={(e) => update({ fontColor: e.target.value.toUpperCase() })}
              className="w-8 h-8 p-0 border-0 cursor-pointer"
            />
          </div>
        </div>

        {/* Background */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Background</Label>
          <div className="flex gap-2 items-center">
            {BG_PRESETS.map((p) => (
              <Button
                key={p.color}
                variant={currentBgColor === p.color ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => update({ backgroundColor: p.color })}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Border style */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Border</Label>
          <div className="flex gap-1.5">
            {BORDER_OPTIONS.map((opt) => (
              <Button
                key={opt}
                variant={currentBorder === opt ? "default" : "outline"}
                size="sm"
                className="text-xs flex-1"
                onClick={() => update({ borderStyle: opt })}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Outline width */}
        {currentBorder === "outline" && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Outline: {currentOutline}px
            </Label>
            <input
              type="range"
              min={0}
              max={8}
              step={1}
              value={currentOutline}
              onChange={(e) => update({ outlineWidth: parseInt(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
