"use client";

import { useEffect } from "react";

interface CostDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  frameCount: number;
  estimatedTokens: number;
  estimatedCost: number;
  videoDuration: number;
}

export function CostDialog({
  open,
  onConfirm,
  onCancel,
  frameCount,
  estimatedTokens,
  estimatedCost,
  videoDuration,
}: CostDialogProps) {
  const transcriptionCost = (videoDuration / 60) * 0.006;
  const totalCost = estimatedCost + transcriptionCost;

  // Close on Escape, lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-surface-inverse/70 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-dialog-title"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-[520px] bg-background border border-foreground flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-6 flex flex-col gap-2">
          <span className="tag">Confirm analysis</span>
          <h2
            id="cost-dialog-title"
            className="font-heading text-[32px] tracking-[-0.022em] leading-[1.05]"
          >
            Before we spend your keys.
          </h2>
          <p className="text-[14px] text-muted-foreground leading-[1.5] mt-1">
            This runs against your OpenAI account. Estimate below is within ~10% of the final bill.
          </p>
        </div>

        {/* Breakdown */}
        <div className="px-8 flex flex-col border-t border-b border-border">
          <Line label="Frames sent to GPT-5.4" value={frameCount.toString()} />
          <Line label="Estimated tokens" value={`~${estimatedTokens.toLocaleString()}`} />
          <Line
            label={`Transcription · ${(videoDuration / 60).toFixed(1)} min`}
            value={`~$${transcriptionCost.toFixed(4)}`}
          />
          <Line label="GPT-5.4 analysis" value={`~$${estimatedCost.toFixed(4)}`} />
          <Line label="Total estimate" value={`~$${totalCost.toFixed(4)}`} emphasised />
        </div>

        {/* Footer */}
        <div className="px-8 py-6 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground italic">
            Charged to your OpenAI account. You can cancel before it completes.
          </p>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 text-[13px] hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              autoFocus
              className="inline-flex items-center gap-2 bg-foreground text-foreground-inverse px-5 py-2.5 text-[13px] font-medium hover:bg-foreground/90 transition-colors"
            >
              Confirm and analyse <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  emphasised,
}: {
  label: string;
  value: string;
  emphasised?: boolean;
}) {
  return (
    <div
      className={
        emphasised
          ? "flex items-center justify-between py-3.5 border-t border-border"
          : "flex items-center justify-between py-3 border-b border-border last:border-b-0"
      }
    >
      <span className={emphasised ? "text-[14px] font-medium" : "text-[13px] text-muted-foreground"}>
        {label}
      </span>
      <span
        className={
          emphasised
            ? "font-mono text-[15px] font-medium"
            : "font-mono text-[13px]"
        }
      >
        {value}
      </span>
    </div>
  );
}
