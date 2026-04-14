"use client";

import { use, useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { ProgressSteps } from "@/components/editor/progress-steps";
import { EdlViewer } from "@/components/editor/edl-viewer";
import { CostDialog } from "@/components/editor/cost-dialog";
import { RenderProgress } from "@/components/editor/render-progress";
import { CompletedView } from "@/components/editor/completed-view";
import { CaptionSettings } from "@/components/editor/caption-settings";
import type { CaptionOperation } from "@/types/edl";
import { Film } from "lucide-react";
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
  const { data: project, isLoading, refetch } = trpc.project.getById.useQuery(
    { id },
    {
      // Poll every 2s while the project is mid-way through any server-side
      // process so the UI updates without the user hitting refresh. Stops the
      // moment status becomes a terminal one.
      refetchInterval: (query) => {
        const p = query.state.data;
        if (!p) return 2000; // still loading initially
        const busy = [
          "uploading",
          "uploaded",
          "analyzing",
          "editing",
          "rendering",
        ].includes(p.status);
        return busy ? 2000 : false;
      },
      refetchOnWindowFocus: true,
    }
  );
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

  // Sync local UI flags to the server status whenever the polled project
  // updates. This is the safety net: if SSE drops mid-analysis (dev mode hot
  // reload, flaky network, connection timeout), polling eventually picks up
  // the real server status and the UI flips out of "processing" / "rendering"
  // state even without the edl_complete / render_complete SSE events.
  useEffect(() => {
    if (!project) return;

    if (project.editDecisionList) {
      const data = project.editDecisionList as EditDecisionList & { _meta?: Record<string, number> };
      setEdl(data);
      if (data._meta) {
        setEdlMeta(data._meta);
      }
    }
    if (project.prompt) {
      setPrompt(project.prompt);
    }
    if (project.outputVideoUrl) {
      setOutputVideoUrl(project.outputVideoUrl);
    }

    // Status-driven flag reconciliation — the canonical source of truth.
    switch (project.status) {
      case "analyzing":
        // Server is actively analysing; make sure the UI reflects it.
        setProcessing(true);
        setRendering(false);
        break;
      case "rendering":
        setProcessing(false);
        setRendering(true);
        break;
      case "editing":
      case "completed":
      case "failed":
        // Terminal-ish states: analysis done or render done. Clear local flags
        // so the UI exits the progress views even if SSE never delivered the
        // terminal event.
        setProcessing(false);
        setRendering(false);
        break;
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

  // Auto-connect SSE whenever the server reports ACTIVE work (analyzing or
  // rendering). Re-checks on every poll — if the old connection died silently
  // (readyState === CLOSED), re-opens. Without this the user has to click
  // Analyse or Render for any live events, and dropped connections would leave
  // the page frozen forever.
  useEffect(() => {
    if (!project) return;
    const isActive =
      project.status === "analyzing" ||
      project.status === "rendering" ||
      project.status === "uploading";
    const connectionDead =
      !eventSourceRef.current ||
      eventSourceRef.current.readyState === EventSource.CLOSED;
    if (isActive && connectionDead) {
      console.log(
        `[page] Auto-connecting SSE for status=${project.status}${
          eventSourceRef.current ? " (previous connection closed)" : ""
        }`
      );
      connectSSE(project.id);
    }
  }, [project, connectSSE]);

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
        <span className="font-mono text-sm italic text-muted-foreground">Loading project…</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-5">
        <span className="tag">Project not found</span>
        <p className="font-heading text-[28px] tracking-[-0.018em]">This project has moved on.</p>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 px-5 py-3 text-sm border border-foreground hover:bg-foreground hover:text-foreground-inverse transition-colors"
        >
          ← Back to projects
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
      <div className="border-b border-border px-6 lg:px-10 py-5 lg:py-7 flex items-end justify-between gap-4 lg:gap-6">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <Link
            href="/projects"
            className="tag hover:text-foreground transition-colors"
          >
            ← Projects · Editor
          </Link>
          <h1 className="font-heading text-[22px] sm:text-[28px] lg:text-[36px] tracking-[-0.022em] leading-tight truncate">
            {project.title}
          </h1>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {hasEdl && !isAnalyzing && !isRendering && !isCompleted && (
            <button
              type="button"
              onClick={handleRender}
              className="inline-flex items-center gap-2.5 bg-foreground text-foreground-inverse px-5 py-3 text-sm font-medium hover:bg-foreground/90 transition-colors"
            >
              Render video <span aria-hidden>→</span>
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main area */}
        <div className="flex-1 flex flex-col px-6 lg:px-10 py-6 lg:py-8 overflow-auto gap-6 lg:gap-8">
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
              {/* Video preview */}
              <div className="shrink-0 w-full aspect-video max-h-[560px] bg-surface-inverse overflow-hidden relative">
                {project.sourceVideoUrl ? (
                  <video
                    src={project.sourceVideoUrl}
                    controls
                    preload="metadata"
                    className="absolute inset-0 w-full h-full object-contain bg-surface-inverse"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Film className="h-12 w-12 opacity-25 text-foreground-inverse" />
                  </div>
                )}
              </div>

              {/* Render progress */}
              {isRendering && (
                <RenderProgress
                  progress={renderProgress}
                  currentStep={renderStep}
                  startedAt={renderStartedAt}
                />
              )}

              {/* Analysis progress */}
              {isAnalyzing && !isRendering && (
                <ProgressSteps
                  currentStage={currentStage}
                  progress={stageProgress}
                  estimatedCost={estimatedCost}
                  frameCount={frameCount}
                  error={error}
                />
              )}

              {/* EDL Viewer + refine */}
              {hasEdl && !isAnalyzing && !isRendering && (
                <div className="flex flex-col gap-8">
                  <EdlViewer
                    edl={edl}
                    meta={edlMeta}
                    disabledOps={disabledOps}
                    onToggleOp={handleToggleOp}
                  />

                  {captionOp && (
                    <CaptionSettings
                      caption={captionOp}
                      onChange={handleCaptionChange}
                    />
                  )}

                  {/* Refine input */}
                  <div className="flex flex-col gap-3">
                    <label className="tag">Refine your edit</label>
                    <textarea
                      placeholder='Make the captions larger and remove that stutter at 00:47…'
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3.5 text-[14px] bg-card border border-border focus:border-foreground focus:outline-none placeholder:italic placeholder:text-muted-foreground/70 resize-none leading-[1.55]"
                    />
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleProcess}
                        disabled={!prompt.trim() || isAnalyzing || isRendering}
                        className="inline-flex items-center px-5 py-3 text-[13px] font-medium border border-foreground hover:bg-foreground hover:text-foreground-inverse transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground"
                      >
                        Re-analyse
                      </button>
                      <button
                        type="button"
                        onClick={handleRender}
                        disabled={isRendering || isAnalyzing}
                        className="inline-flex items-center gap-2.5 bg-foreground text-foreground-inverse px-5 py-3 text-[13px] font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40"
                      >
                        Render video <span aria-hidden>→</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Initial prompt input (no EDL yet) */}
              {!hasEdl && !isAnalyzing && !isRendering && (
                <div className="flex flex-col gap-5 max-w-[720px]">
                  <div className="flex flex-col gap-1.5">
                    <span className="tag">First edit</span>
                    <h2 className="font-heading text-[32px] tracking-[-0.022em] leading-tight">
                      Describe how you want it cut.
                    </h2>
                  </div>
                  <textarea
                    placeholder='Trim the dead air. Remove silences and filler words. Speed up to 1.2×. Reframe to 9:16. Add karaoke captions. Drop in real photos of whatever I mention.'
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={5}
                    className="w-full px-5 py-4 text-[15px] bg-card border border-border focus:border-foreground focus:outline-none placeholder:italic placeholder:text-muted-foreground/70 resize-none leading-[1.55]"
                  />
                  {error && (
                    <div className="border border-accent px-4 py-3 text-sm text-accent">
                      {error}
                    </div>
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={handleProcess}
                      disabled={!prompt.trim() || isAnalyzing}
                      className="inline-flex items-center gap-2.5 bg-foreground text-foreground-inverse px-6 py-3.5 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40"
                    >
                      Analyse video <span aria-hidden>→</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Metadata sidebar — hide on narrower than xl, becomes inline inside main on smaller */}
        <aside className="hidden xl:flex w-[260px] shrink-0 border-l border-border px-6 py-8 overflow-auto flex-col gap-8">
          <div className="flex flex-col gap-4">
            <h2 className="tag">Video details</h2>
            <div className="flex flex-col gap-4">
              <Stat label="Duration" value={formatDuration(project.sourceVideoDuration)} />
              <Stat
                label="Resolution"
                value={
                  project.sourceVideoWidth && project.sourceVideoHeight
                    ? `${project.sourceVideoWidth} × ${project.sourceVideoHeight}`
                    : "Unknown"
                }
              />
              {project.sourceVideoFps && (
                <Stat label="Frame rate" value={`${Math.round(project.sourceVideoFps)} fps`} />
              )}
              <Stat label="File size" value={formatFileSize(project.sourceVideoSize)} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="tag">Quick actions</h2>
            <div className="flex flex-col gap-0 border-t border-border">
              {QUICK_ACTIONS.map((action) => (
                <button
                  type="button"
                  key={action.label}
                  disabled={isAnalyzing}
                  onClick={() => handleQuickAction(action.prompt)}
                  className="text-left text-[13px] py-2.5 border-b border-border hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </aside>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-mono tracking-[0.14em] uppercase text-muted-foreground">
        {label}
      </span>
      <span className="text-[14px]">{value}</span>
    </div>
  );
}
