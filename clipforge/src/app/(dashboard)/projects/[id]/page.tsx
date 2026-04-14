"use client";

import { use, useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ProgressSteps } from "@/components/editor/progress-steps";
import { EdlViewer } from "@/components/editor/edl-viewer";
import { CostDialog } from "@/components/editor/cost-dialog";
import { RenderProgress } from "@/components/editor/render-progress";
import { CompletedView } from "@/components/editor/completed-view";
import { CaptionSettings } from "@/components/editor/caption-settings";
import type { CaptionOperation } from "@/types/edl";
import {
  ArrowLeft,
  Play,
  Clock,
  Maximize,
  HardDrive,
  Film,
  Loader2,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { EditDecisionList } from "@/types/edl";
import type { ProgressEvent } from "@/types/events";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "Unknown";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Quick action presets that map to prompts
const QUICK_ACTIONS = [
  { label: "Remove silences", prompt: "Remove all silences longer than 0.5 seconds" },
  { label: "Add captions", prompt: "Add karaoke-style captions at the bottom center, large white text with black background" },
  { label: "Make it vertical", prompt: "Reframe the video to 9:16 vertical format for mobile" },
  { label: "Speed up 1.25x", prompt: "Speed up the entire video by 1.25x while preserving pitch" },
  { label: "Remove filler words", prompt: "Remove all filler words like um, uh, like, you know, basically" },
  { label: "Auto-edit for TikTok", prompt: "Full TikTok optimization: remove silences, remove filler words, add karaoke captions, reframe to 9:16 vertical, trim to 60 seconds max" },
];

export default function ProjectEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: project, isLoading, refetch } = trpc.project.getById.useQuery({ id });
  const [prompt, setPrompt] = useState("");
  const [processing, setProcessing] = useState(false);
  const [currentStage, setCurrentStage] = useState("");
  const [stageProgress, setStageProgress] = useState(0);
  const [estimatedCost, setEstimatedCost] = useState("");
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState("");
  const [edl, setEdl] = useState<EditDecisionList | null>(null);
  const [edlMeta, setEdlMeta] = useState<Record<string, number>>({});
  const [disabledOps, setDisabledOps] = useState<Set<number>>(new Set());
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStep, setRenderStep] = useState("");
  const [renderStartedAt, setRenderStartedAt] = useState(0);
  const [outputVideoUrl, setOutputVideoUrl] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load existing EDL from project
  useEffect(() => {
    if (project?.editDecisionList) {
      const data = project.editDecisionList as EditDecisionList & { _meta?: Record<string, number> };
      setEdl(data);
      if (data._meta) {
        setEdlMeta(data._meta);
      }
    }
    if (project?.prompt) {
      setPrompt(project.prompt);
    }
    if (project?.outputVideoUrl) {
      setOutputVideoUrl(project.outputVideoUrl);
    }
  }, [project]);

  // SSE connection
  const connectSSE = useCallback(
    (projectId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource(`/api/sse/${projectId}`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ProgressEvent & {
            stage: string;
            progress?: number;
            estimatedCost?: string;
            frameCount?: number;
            message?: string;
            edl?: EditDecisionList;
          };

          setCurrentStage(data.stage);

          if ("progress" in data && typeof data.progress === "number") {
            setStageProgress(data.progress);
          }

          if (data.stage === "extracting_frames" && data.frameCount) {
            setFrameCount(data.frameCount);
          }

          if (data.stage === "analyzing" && data.estimatedCost) {
            setEstimatedCost(data.estimatedCost);
          }

          if (data.stage === "rendering") {
            setRendering(true);
            if ("progress" in data && typeof data.progress === "number") {
              setRenderProgress(data.progress);
            }
            const currentStep = (data as Record<string, unknown>).currentStep;
            if (typeof currentStep === "string") {
              setRenderStep(currentStep);
            }
          }

          if (data.stage === "render_complete") {
            setRendering(false);
            const outputUrl = (data as Record<string, unknown>).outputUrl;
            if (typeof outputUrl === "string") {
              setOutputVideoUrl(outputUrl);
            }
            refetch();
            toast.success("Video rendered successfully");
          }

          if (data.stage === "edl_complete" && data.edl) {
            setEdl(data.edl);
            setProcessing(false);
            refetch();
            toast.success("Analysis complete");
          }

          if (data.stage === "error") {
            setError(data.message ?? "An error occurred");
            setProcessing(false);
            setRendering(false);
            refetch();
          }
        } catch {
          // Ignore parse errors (heartbeats)
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
      };

      return () => {
        es.close();
        eventSourceRef.current = null;
      };
    },
    [refetch]
  );

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const handleProcess = () => {
    if (!prompt.trim()) {
      toast.error("Please describe how you want to edit the video");
      return;
    }

    // Show cost confirmation dialog
    setShowCostDialog(true);
  };

  const confirmProcess = async () => {
    setShowCostDialog(false);
    setProcessing(true);
    setError("");
    setEdl(null);
    setCurrentStage("extracting_audio");
    setStageProgress(0);

    // Connect SSE
    connectSSE(id);

    try {
      const response = await fetch(`/api/projects/${id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start analysis");
      }
    } catch (err) {
      setProcessing(false);
      setError(err instanceof Error ? err.message : "Failed to start analysis");
      toast.error(err instanceof Error ? err.message : "Failed to start analysis");
    }
  };

  const handleQuickAction = (actionPrompt: string) => {
    setPrompt(actionPrompt);
  };

  const handleToggleOp = (index: number) => {
    setDisabledOps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleCaptionChange = (updated: CaptionOperation) => {
    if (!edl) return;
    const newOps = edl.operations.map((op) =>
      op.type === "caption" ? updated : op
    );
    setEdl({ ...edl, operations: newOps });
  };

  // Find the caption operation in the current EDL (if any)
  const captionOp = edl?.operations.find(
    (op, i) => op.type === "caption" && !disabledOps.has(i)
  ) as CaptionOperation | undefined;

  const handleRender = async () => {
    setRendering(true);
    setRenderProgress(0);
    setRenderStep("Starting render...");
    setRenderStartedAt(Date.now());
    setError("");
    setOutputVideoUrl(null);

    // Connect SSE for render progress
    connectSSE(id);

    try {
      const response = await fetch(`/api/projects/${id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disabledOps: Array.from(disabledOps),
          edl: edl,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start render");
      }
    } catch (err) {
      setRendering(false);
      setError(err instanceof Error ? err.message : "Failed to start render");
      toast.error(err instanceof Error ? err.message : "Failed to start render");
    }
  };

  const handleEditFurther = () => {
    setOutputVideoUrl(null);
    setEdl(edl); // Keep current EDL
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Project not found</p>
        <Link href="/projects">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Button>
        </Link>
      </div>
    );
  }

  // Terminal DB states override local in-flight flags — prevents a stuck spinner
  // when the SSE error event is missed but the DB reflects "failed" / "completed".
  const isTerminal = project.status === "failed" || project.status === "completed";
  const isAnalyzing = !isTerminal && (processing || project.status === "analyzing");
  const isRendering = !isTerminal && (rendering || project.status === "rendering");
  const isCompleted = outputVideoUrl !== null || project.status === "completed";
  const hasEdl = edl !== null;

  // Rough cost estimates for the dialog
  const estimatedFrames = Math.min(30, Math.max(5, Math.ceil((project.sourceVideoDuration ?? 30) / 2)));
  const estimatedTokens = estimatedFrames * 85 + 2000 + 500 + 2000; // frames + transcript + system + output
  const estimatedAnalysisCost = estimatedTokens * (2.0 / 1_000_000) + 2000 * (8.0 / 1_000_000);

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="border-b border-border/50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/projects">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="font-semibold text-sm">{project.title}</h1>
          <Badge variant="outline" className="text-xs">
            {project.status}
          </Badge>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video + Prompt area */}
        <div className="flex-1 flex flex-col p-6 overflow-auto">
          {/* Completed: side-by-side comparison */}
          {isCompleted && project.sourceVideoUrl && (project.outputVideoUrl || outputVideoUrl) ? (
            <CompletedView
              sourceVideoUrl={project.sourceVideoUrl}
              outputVideoUrl={outputVideoUrl ?? project.outputVideoUrl ?? ""}
              sourceDuration={project.sourceVideoDuration}
              outputDuration={edl?.estimatedOutputDuration ?? null}
              sourceResolution={
                project.sourceVideoWidth && project.sourceVideoHeight
                  ? `${project.sourceVideoWidth}x${project.sourceVideoHeight}`
                  : "Unknown"
              }
              onEditFurther={handleEditFurther}
            />
          ) : (
            <>
              {/* Video player */}
              <div className="aspect-video bg-black rounded-lg overflow-hidden mb-6 relative">
                {project.sourceVideoUrl ? (
                  <video
                    src={project.sourceVideoUrl}
                    controls
                    className="w-full h-full"
                    preload="metadata"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <Film className="h-12 w-12 opacity-30" />
                  </div>
                )}
              </div>

              {/* Render progress */}
              {isRendering && (
                <div className="mb-6">
                  <RenderProgress
                    progress={renderProgress}
                    currentStep={renderStep}
                    startedAt={renderStartedAt}
                  />
                </div>
              )}

              {/* Analysis progress */}
              {isAnalyzing && !isRendering && (
                <div className="mb-6">
                  <ProgressSteps
                    currentStage={currentStage}
                    progress={stageProgress}
                    estimatedCost={estimatedCost}
                    frameCount={frameCount}
                    error={error}
                  />
                </div>
              )}

              {/* EDL Viewer */}
              {hasEdl && !isAnalyzing && !isRendering && (
                <div className="mb-6">
                  <EdlViewer
                    edl={edl}
                    meta={edlMeta}
                    disabledOps={disabledOps}
                    onToggleOp={handleToggleOp}
                  />

                  {/* Caption customization */}
                  {captionOp && (
                    <div className="mt-4">
                      <CaptionSettings
                        caption={captionOp}
                        onChange={handleCaptionChange}
                      />
                    </div>
                  )}

                  {/* Refine input */}
                  <div className="mt-4 space-y-3">
                    <label className="text-sm font-medium">
                      Refine your edit
                    </label>
                    <Textarea
                      placeholder='Example: "Keep the pause at 0:45" or "Make the captions bigger"'
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={3}
                      className="resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleProcess}
                        disabled={!prompt.trim() || isAnalyzing || isRendering}
                        className="gap-2"
                        variant="outline"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Re-analyze
                      </Button>
                      <Button
                        onClick={handleRender}
                        disabled={isRendering || isAnalyzing}
                        className="gap-2"
                      >
                        <Sparkles className="h-4 w-4" />
                        Render Video
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Initial prompt input (no EDL yet) */}
              {!hasEdl && !isAnalyzing && !isRendering && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">
                    Describe how you want to edit this video
                  </label>
                  <Textarea
                    placeholder='Example: "Remove all silences, add karaoke-style captions, and reframe to vertical 9:16 for TikTok"'
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                  {error && (
                    <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                      {error}
                    </div>
                  )}
                  <Button
                    onClick={handleProcess}
                    disabled={!prompt.trim() || isAnalyzing}
                    className="gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Process Video
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Metadata sidebar */}
        <div className="w-72 border-l border-border/50 p-6 overflow-auto">
          <h2 className="text-sm font-semibold mb-4">Video Details</h2>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-sm font-medium">
                  {formatDuration(project.sourceVideoDuration)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Maximize className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Resolution</p>
                <p className="text-sm font-medium">
                  {project.sourceVideoWidth && project.sourceVideoHeight
                    ? `${project.sourceVideoWidth} x ${project.sourceVideoHeight}`
                    : "Unknown"}
                </p>
              </div>
            </div>

            {project.sourceVideoFps && (
              <div className="flex items-center gap-3">
                <Play className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Frame rate</p>
                  <p className="text-sm font-medium">
                    {Math.round(project.sourceVideoFps)} fps
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">File size</p>
                <p className="text-sm font-medium">
                  {formatFileSize(project.sourceVideoSize)}
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          <h2 className="text-sm font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs"
                disabled={isAnalyzing}
                onClick={() => handleQuickAction(action.prompt)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Cost confirmation dialog */}
      <CostDialog
        open={showCostDialog}
        onConfirm={confirmProcess}
        onCancel={() => setShowCostDialog(false)}
        frameCount={estimatedFrames}
        estimatedTokens={estimatedTokens}
        estimatedCost={estimatedAnalysisCost}
        videoDuration={project.sourceVideoDuration ?? 0}
      />

    </div>
  );
}
