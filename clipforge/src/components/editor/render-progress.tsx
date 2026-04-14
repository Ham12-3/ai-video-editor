"use client";

import { useState, useEffect } from "react";

interface RenderProgressProps {
  progress: number;
  currentStep: string;
  startedAt: number; // timestamp ms
}

const STAGES = [
  { tag: "01  Transcript", match: ["transcript", "transcrib"] },
  { tag: "02  Analysis", match: ["analys", "analyz", "edit plan"] },
  { tag: "03  Encode", match: ["render", "encode", "encoding", "ffmpeg"] },
  { tag: "04  Illustrations", match: ["illustration", "nano", "gemini", "image"] },
  { tag: "05  Overlay", match: ["overlay", "finaliz"] },
] as const;

function formatMS(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function stageState(index: number, progress: number, currentStep: string): "done" | "active" | "pending" {
  const lower = currentStep.toLowerCase();
  const match = STAGES[index].match.some((m) => lower.includes(m));
  if (match) return "active";

  // Heuristic: if we've moved past the approximate stage boundary, mark it done.
  // Transcript/analysis typically complete before render starts (progress ~0 at render start).
  // Encode runs 15-88, overlay 88+.
  const boundaries = [5, 12, 88, 95, 100];
  if (progress >= boundaries[index]) return "done";
  return "pending";
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

  const estimatedTotal =
    progress > 5 ? Math.round((elapsed / progress) * 100) : 0;
  const remaining = Math.max(0, estimatedTotal - elapsed);

  return (
    <section className="flex flex-col gap-12 py-4">
      <div className="flex flex-col gap-1.5">
        <span className="tag">Rendering · in progress</span>
        <h2 className="font-heading text-[48px] tracking-[-0.028em] leading-[1.05] max-w-[820px]">
          {currentStep || "Generating your video in the background."}
        </h2>
      </div>

      <div className="flex items-end gap-8">
        <span className="font-mono text-[128px] tracking-[-0.04em] leading-none">
          {progress}%
        </span>
        <div className="flex-1 flex flex-col gap-3 pb-6">
          <span className="font-mono text-[13px] text-muted-foreground tracking-wide">
            Elapsed {formatMS(elapsed)}
            {remaining > 0 && <> · ETA ~{formatMS(remaining)}</>}
          </span>
          <div className="w-full h-[3px] bg-border relative">
            <div
              className="absolute left-0 top-0 h-full bg-foreground transition-[width] duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <span className="text-sm">{currentStep}</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-0 border-t border-b border-border py-5">
        {STAGES.map((stage, i) => {
          const state = stageState(i, progress, currentStep);
          return (
            <div key={stage.tag} className="flex flex-col gap-1 px-2">
              <span
                className={
                  state === "active"
                    ? "tag !text-foreground font-bold"
                    : "tag"
                }
              >
                {stage.tag}
              </span>
              <span
                className={
                  state === "active"
                    ? "text-sm font-medium"
                    : state === "done"
                    ? "text-sm italic"
                    : "text-sm italic text-muted-foreground"
                }
              >
                {state === "done" ? "Done" : state === "active" ? "In progress" : "Waiting"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
