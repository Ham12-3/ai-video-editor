"use client";

import { useState } from "react";
import type { EditDecisionList, EditOperation } from "@/types/edl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Scissors,
  Captions,
  Gauge,
  VolumeX,
  Maximize,
  Layers,
  Clock,
  MessageSquare,
  DollarSign,
  ToggleLeft,
  ToggleRight,
  Image,
} from "lucide-react";

const OP_ICONS: Record<string, React.ElementType> = {
  trim: Scissors,
  cut: Scissors,
  caption: Captions,
  speed: Gauge,
  silence_remove: VolumeX,
  reframe: Maximize,
  transition: Layers,
  illustration: Image,
};

const OP_COLORS: Record<string, string> = {
  trim: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  cut: "bg-red-500/10 text-red-500 border-red-500/20",
  caption: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  speed: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  silence_remove: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  reframe: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  transition: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  illustration: "bg-pink-500/10 text-pink-500 border-pink-500/20",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

function OperationDescription({ op }: { op: EditOperation }) {
  switch (op.type) {
    case "trim":
      return (
        <span>
          Trim to {formatTime(op.startTime)} - {formatTime(op.endTime)}.{" "}
          {op.reason}
        </span>
      );
    case "cut":
      return (
        <span>
          {op.segments.length} segment{op.segments.length !== 1 ? "s" : ""} to remove
        </span>
      );
    case "caption":
      return (
        <span>
          {op.style} captions, {op.position}, {op.fontSize} text
        </span>
      );
    case "speed":
      return (
        <span>
          {op.segments.length} speed change{op.segments.length !== 1 ? "s" : ""}
        </span>
      );
    case "silence_remove":
      return (
        <span>
          Remove silences {">"}
          {op.minSilenceDuration}s
          {op.removeFiller
            ? ` and filler words (${op.fillerWords.join(", ")})`
            : ""}
        </span>
      );
    case "reframe":
      return (
        <span>
          Reframe to {op.targetAspectRatio} ({op.trackingMode} tracking)
        </span>
      );
    case "transition":
      return (
        <span>
          {op.between.length} transition{op.between.length !== 1 ? "s" : ""}
        </span>
      );
    case "illustration":
      return (
        <span>
          {op.illustrations.length} AI illustration{op.illustrations.length !== 1 ? "s" : ""} (DALL-E)
        </span>
      );
    default:
      return <span>Unknown operation</span>;
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
  return (
    <div className="space-y-4">
      {/* AI Reasoning */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            AI Reasoning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {edl.reasoning}
          </p>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Output duration</p>
            <p className="text-sm font-medium">
              {formatTime(edl.estimatedOutputDuration)}
            </p>
          </div>
        </div>

        {meta?.actualCost !== undefined && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">API cost</p>
              <p className="text-sm font-medium">
                ${((meta.actualCost ?? 0) + (meta.transcriptionCost ?? 0)).toFixed(4)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Operations list */}
      <div>
        <h3 className="text-sm font-semibold mb-3">
          Edit Operations ({edl.operations.length})
        </h3>
        <div className="space-y-2">
          {edl.operations.map((op, i) => {
            const Icon = OP_ICONS[op.type] ?? Layers;
            const colorClass = OP_COLORS[op.type] ?? "";
            const isDisabled = disabledOps.has(i);

            return (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-md border transition-opacity ${
                  isDisabled ? "opacity-40" : ""
                }`}
              >
                <Badge variant="outline" className={colorClass}>
                  <Icon className="h-3 w-3 mr-1" />
                  {op.type}
                </Badge>

                <span className="flex-1 text-sm text-muted-foreground">
                  <OperationDescription op={op} />
                </span>

                <button
                  onClick={() => onToggleOp(i)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={isDisabled ? "Enable operation" : "Disable operation"}
                >
                  {isDisabled ? (
                    <ToggleLeft className="h-5 w-5" />
                  ) : (
                    <ToggleRight className="h-5 w-5 text-primary" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
