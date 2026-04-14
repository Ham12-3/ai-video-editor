"use client";

import { cn } from "@/lib/utils";
import { Check, Loader2, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const STEPS = [
  { key: "extracting_audio", label: "Extracting audio" },
  { key: "transcribing", label: "Transcribing" },
  { key: "transcript_analysis", label: "Analyzing transcript" },
  { key: "extracting_frames", label: "Extracting key frames" },
  { key: "visual_analysis", label: "Visual analysis + EDL" },
  { key: "edl_review", label: "Reviewing edit plan" },
  { key: "generating_edl", label: "Finalizing" },
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

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const isActive = step.key === currentStage;
          const isComplete = i < currentIndex || currentStage === "edl_complete";
          const isPending = i > currentIndex;

          return (
            <div key={step.key} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full shrink-0",
                  isComplete && "bg-primary text-primary-foreground",
                  isActive && "bg-primary/20 text-primary",
                  isPending && "bg-muted text-muted-foreground"
                )}
              >
                {isComplete ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm",
                    isActive && "font-medium text-foreground",
                    isComplete && "text-muted-foreground",
                    isPending && "text-muted-foreground/50"
                  )}
                >
                  {step.label}
                  {isActive &&
                    step.key === "extracting_frames" &&
                    frameCount !== undefined &&
                    ` (${frameCount} frames)`}
                </p>
                {isActive && (
                  <Progress value={progress} className="h-1 mt-1.5" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {estimatedCost && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          {estimatedCost}
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
