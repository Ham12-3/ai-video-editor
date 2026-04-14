"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

interface CompletedViewProps {
  sourceVideoUrl: string;
  outputVideoUrl: string;
  sourceDuration: number | null;
  outputDuration: number | null;
  sourceResolution: string;
  onEditFurther: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CompletedView({
  sourceVideoUrl,
  outputVideoUrl,
  sourceDuration,
  outputDuration,
  sourceResolution,
  onEditFurther,
}: CompletedViewProps) {
  const [copied, setCopied] = useState(false);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = outputVideoUrl;
    a.download = "clipforge-output.mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(outputVideoUrl, window.location.origin).toString());
      setCopied(true);
      toast.success("Share link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
      {/* Vertical output preview */}
      <div className="w-full max-w-[260px] lg:w-[340px] lg:max-w-none shrink-0 aspect-[9/16] bg-surface-inverse flex flex-col justify-end p-5 gap-2 relative">
        <video
          src={outputVideoUrl}
          controls
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="relative z-10 flex flex-col gap-2 pointer-events-none">
          <span className="inline-flex w-fit px-3 py-1.5 bg-yellow-300 text-foreground text-[11px] font-mono tracking-[0.15em] uppercase">
            Shipped
          </span>
          <span className="font-mono text-[10px] text-foreground-inverse tracking-wide">
            {formatDuration(outputDuration)} · 9:16 · 1080×1920
          </span>
        </div>
      </div>

      {/* Right column */}
      <div className="flex-1 flex flex-col gap-9">
        <div className="flex flex-col gap-4">
          <span className="tag">Shipped · ready to download</span>
          <h2 className="font-heading text-[56px] sm:text-[72px] lg:text-[96px] tracking-[-0.035em] leading-none">
            It&rsquo;s done.
          </h2>
          <p className="font-heading italic text-[18px] lg:text-[20px] tracking-[-0.015em] leading-[1.45] max-w-[560px]">
            Your edited video is ready. The file is yours, download it, share it, or start
            another project. Nothing left behind on our machines.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 border-t border-b border-border py-5">
          <Stat label="Duration" value={formatDuration(outputDuration ?? sourceDuration)} />
          <Stat label="Source" value={formatDuration(sourceDuration)} />
          <Stat label="Resolution" value={sourceResolution || "1080p"} />
          <Stat label="Format" value="MP4 · H.264" />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-3 bg-foreground text-foreground-inverse px-7 py-4 text-[15px] font-medium hover:bg-foreground/90 transition-colors"
          >
            Download MP4 <span aria-hidden>↓</span>
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center px-6 py-4 text-sm border border-foreground hover:bg-foreground hover:text-foreground-inverse transition-colors"
          >
            {copied ? "Copied" : "Copy share link"}
          </button>
          <button
            type="button"
            onClick={onEditFurther}
            className="inline-flex items-center px-5 py-4 text-sm hover:bg-muted transition-colors"
          >
            Edit further
          </button>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-5 py-4 text-sm hover:bg-muted transition-colors"
          >
            Start another project <span aria-hidden>→</span>
          </Link>
        </div>

        {/* Before/after compare */}
        <div className="flex flex-col gap-3">
          <span className="tag">Before · Source clip</span>
          <div className="aspect-video bg-surface-inverse max-w-[560px]">
            <video
              src={sourceVideoUrl}
              controls
              className="w-full h-full"
              preload="metadata"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="tag">{label}</span>
      <span className="font-heading text-[28px] tracking-[-0.018em] leading-none">{value}</span>
    </div>
  );
}
