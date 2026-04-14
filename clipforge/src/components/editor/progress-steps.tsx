"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { key: "extracting_audio", label: "Extracting audio", tag: "01  Audio" },
  { key: "transcribing", label: "Transcribing with Whisper", tag: "02  Transcript" },
  { key: "transcript_analysis", label: "Analysing transcript", tag: "03  Read" },
  { key: "extracting_frames", label: "Extracting key frames", tag: "04  Frames" },
  { key: "visual_analysis", label: "Visual analysis + EDL", tag: "05  Plan" },
  { key: "edl_review", label: "Reviewing edit plan", tag: "06  Review" },
  { key: "generating_edl", label: "Finalising", tag: "07  Ready" },
] as const;

interface ProgressStepsProps {
  currentStage: string;
  progress: number;
  estimatedCost?: string;
  frameCount?: number;
  error?: string;
}

export function ProgressSteps({
  currentStage,
  progress,
  estimatedCost,
  frameCount,
  error,
}: ProgressStepsProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStage);
  const isDone = currentStage === "edl_complete";

  return (
    <section className="flex flex-col gap-10 py-2">
      <div className="flex flex-col gap-1.5">
        <span className="tag">Analysing your video</span>
        <h2 className="font-heading text-[36px] tracking-[-0.022em] leading-tight">
          {isDone
            ? "Edit plan ready."
            : STEPS[Math.max(0, currentIndex)]?.label ?? "Starting analysis…"}
        </h2>
      </div>

      <div className="flex flex-col border-t border-b border-border">
        {STEPS.map((step, i) => {
          const isActive = step.key === currentStage;
          const isComplete = i < currentIndex || isDone;
          const isPending = i > currentIndex && !isDone;

          return (
            <div
              key={step.key}
              className={cn(
                "grid grid-cols-[140px_1fr_auto] items-center gap-6 py-3.5 border-b border-border last:border-b-0",
                isPending && "opacity-50"
              )}
            >
              <span
                className={cn(
                  "tag",
                  isActive && "!text-foreground font-bold"
                )}
              >
                {step.tag}
              </span>
              <div className="flex flex-col gap-1">
                <span className={cn("text-sm", isActive && "font-medium")}>
                  {step.label}
                  {isActive &&
                    step.key === "extracting_frames" &&
                    frameCount !== undefined &&
                    ` · ${frameCount} frames`}
                </span>
                {isActive && (
                  <div className="w-full h-[2px] bg-border mt-1">
                    <div
                      className="h-full bg-foreground transition-[width] duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                  </div>
                )}
              </div>
              <span
                className={cn(
                  "tag shrink-0",
                  isActive ? "!text-foreground" : isComplete ? "" : "italic"
                )}
              >
                {isComplete ? "Done" : isActive ? `${progress}%` : "Waiting"}
              </span>
            </div>
          );
        })}
      </div>

      {estimatedCost && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="tag">Estimated cost</span>
          <span className="font-mono">{estimatedCost}</span>
        </div>
      )}

      {error && (
        <div className="border border-accent px-4 py-3 text-sm text-accent">
          <span className="tag !text-accent">Error</span>
          <p className="mt-1">{error}</p>
        </div>
      )}
    </section>
  );
}
