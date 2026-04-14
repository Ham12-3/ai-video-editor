"use client";

import type { EditDecisionList, EditOperation } from "@/types/edl";
import { cn } from "@/lib/utils";

const OP_LABEL: Record<string, string> = {
  trim: "Trim",
  cut: "Cut",
  caption: "Caption",
  speed: "Speed",
  silence_remove: "Silence remove",
  reframe: "Reframe",
  transition: "Transition",
  illustration: "Illustration",
  hook: "Hook banner",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(0);
  return `${m.toString().padStart(2, "0")}:${s.padStart(2, "0")}`;
}

function describe(op: EditOperation): string {
  switch (op.type) {
    case "trim":
      return `Keep ${formatTime(op.startTime)} → ${formatTime(op.endTime)}`;
    case "cut":
      return `${op.segments.length} segment${op.segments.length !== 1 ? "s" : ""} removed`;
    case "caption":
      return `${op.style}, ${op.fontSize}, ${op.position.replace("-", " ")}`;
    case "speed": {
      const f = op.segments[0]?.factor ?? 1;
      return op.segments.length === 1 ? `Whole clip → ${f}×` : `${op.segments.length} speed changes`;
    }
    case "silence_remove": {
      const base = `Silences ≥ ${op.minSilenceDuration}s`;
      if (op.removeFiller && op.fillerWords.length) return `${base} + filler (${op.fillerWords.length})`;
      return base;
    }
    case "reframe":
      return `${op.targetAspectRatio} vertical, ${op.trackingMode} tracking`;
    case "transition":
      return `${op.between.length} transition${op.between.length !== 1 ? "s" : ""}`;
    case "illustration":
      return `${op.illustrations.length} photo${op.illustrations.length !== 1 ? "s" : ""} via Nano Banana 2`;
    case "hook":
      return `"${op.text}" · top banner · ${op.style === "highlight" ? "yellow box" : "yellow outline"}`;
    default:
      return "Unknown operation";
  }
}

interface EdlViewerProps {
  edl: EditDecisionList;
  meta?: {
    actualTokens?: number;
    actualCost?: number;
    transcriptionCost?: number;
    frameCount?: number;
    silenceCount?: number;
    fillerWordCount?: number;
  };
  disabledOps: Set<number>;
  onToggleOp: (index: number) => void;
}

export function EdlViewer({ edl, meta, disabledOps, onToggleOp }: EdlViewerProps) {
  const totalCost =
    (meta?.actualCost ?? 0) + (meta?.transcriptionCost ?? 0);
  const activeCount = edl.operations.length - disabledOps.size;

  return (
    <div className="flex flex-col gap-5">
      {/* Head */}
      <div className="flex items-end justify-between">
        <h3 className="font-heading text-[24px] tracking-[-0.015em] leading-tight">Edit plan</h3>
        <span className="tag">
          {activeCount} of {edl.operations.length} ops
          {totalCost > 0 && <> · ${totalCost.toFixed(2)}</>}
        </span>
      </div>

      {/* Reasoning */}
      {edl.reasoning && (
        <p className="font-heading italic text-[15px] tracking-[-0.01em] leading-[1.5] text-muted-foreground border-l-2 border-border pl-4">
          {edl.reasoning}
        </p>
      )}

      {/* Operations list */}
      <div className="flex flex-col border-t border-border">
        {edl.operations.map((op, i) => {
          const isDisabled = disabledOps.has(i);
          return (
            <div
              key={i}
              className={cn(
                "flex items-start justify-between gap-3 py-3.5 border-b border-border",
                isDisabled && "opacity-40"
              )}
            >
              <div className="flex-1 flex flex-col gap-1">
                <span className="tag">
                  {(i + 1).toString().padStart(2, "0")} · {OP_LABEL[op.type] ?? op.type}
                </span>
                <span className="text-[14px]">{describe(op)}</span>
              </div>
              <button
                type="button"
                onClick={() => onToggleOp(i)}
                aria-label={isDisabled ? `Enable ${op.type}` : `Disable ${op.type}`}
                className={cn(
                  "shrink-0 h-[18px] w-8 flex items-center transition-colors",
                  isDisabled ? "bg-transparent border border-foreground" : "bg-foreground"
                )}
              >
                <span
                  className={cn(
                    "block w-3.5 h-3.5 bg-foreground-inverse transition-transform",
                    isDisabled ? "translate-x-0 bg-foreground" : "translate-x-[14px]"
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-2">
        <Stat label="Output duration" value={formatTime(edl.estimatedOutputDuration)} />
        {totalCost > 0 && <Stat label="Analysis cost" value={`$${totalCost.toFixed(4)}`} />}
        {meta?.frameCount !== undefined && (
          <Stat label="Frames analysed" value={meta.frameCount.toString()} />
        )}
        {meta?.silenceCount !== undefined && (
          <Stat label="Silences found" value={meta.silenceCount.toString()} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="tag">{label}</span>
      <span className="font-mono text-[14px]">{value}</span>
    </div>
  );
}
