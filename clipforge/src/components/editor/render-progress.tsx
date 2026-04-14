"use client";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, Clock } from "lucide-react";
import { useState, useEffect } from "react";

interface RenderProgressProps {
  progress: number;
  currentStep: string;
  startedAt: number; // timestamp ms
}

export function RenderProgress({
  progress,
  currentStep,
  startedAt,
}: RenderProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Estimate remaining time
  const estimatedTotal =
    progress > 5 ? Math.round((elapsed / progress) * 100) : 0;
  const remaining = Math.max(0, estimatedTotal - elapsed);

  return (
    <div className="space-y-4 p-6 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div>
          <p className="font-medium text-sm">Rendering video...</p>
          <p className="text-xs text-muted-foreground">{currentStep}</p>
        </div>
      </div>

      <Progress value={progress} className="h-2" />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono">{progress}%</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatElapsed(elapsed)} elapsed
          </span>
          {remaining > 0 && (
            <span>~{formatElapsed(remaining)} remaining</span>
          )}
        </div>
      </div>
    </div>
  );
}
