"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Download,
  RotateCcw,
  Plus,
  Clock,
  HardDrive,
  Maximize,
} from "lucide-react";
import Link from "next/link";

interface CompletedViewProps {
  sourceVideoUrl: string;
  outputVideoUrl: string;
  sourceDuration: number | null;
  outputDuration: number | null;
  sourceResolution: string;
  onEditFurther: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CompletedView({
  sourceVideoUrl,
  outputVideoUrl,
  sourceDuration,
  outputDuration,
  sourceResolution,
  onEditFurther,
}: CompletedViewProps) {
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = outputVideoUrl;
    a.download = "clipforge-output.mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* Side-by-side video comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-xs">Original</Badge>
            <span className="text-xs text-muted-foreground">
              {formatDuration(sourceDuration)}
            </span>
          </div>
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            <video
              src={sourceVideoUrl}
              controls
              className="w-full h-full"
              preload="metadata"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
              Edited
            </Badge>
            {outputDuration && (
              <span className="text-xs text-muted-foreground">
                {formatDuration(outputDuration)}
              </span>
            )}
          </div>
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            <video
              src={outputVideoUrl}
              controls
              className="w-full h-full"
              preload="metadata"
              autoPlay
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleDownload} className="gap-2">
          <Download className="h-4 w-4" />
          Download MP4
        </Button>
        <Button variant="outline" onClick={onEditFurther} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Edit Further
        </Button>
        <Link href="/projects/new">
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      <Separator />

      {/* Export options */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Re-export at different resolution</h3>
        <div className="flex gap-2">
          {["1080p", "720p", "480p"].map((res) => (
            <Button
              key={res}
              variant="outline"
              size="sm"
              disabled={res !== "1080p"}
              title={res === "1080p" ? "Current resolution" : "Coming soon"}
            >
              {res}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
