"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  uploading: "UPLOADING",
  uploaded: "READY",
  analyzing: "ANALYSING",
  editing: "EDITING",
  rendering: "RENDERING",
  completed: "SHIPPED",
  failed: "FAILED",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatRelative(date: string | Date): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function opsSummary(project: { editDecisionList?: unknown }): string {
  const edl = project.editDecisionList as { operations?: { type: string }[] } | null;
  const ops = edl?.operations ?? [];
  if (ops.length === 0) return "No edits yet";
  const types = new Set(ops.map((o) => o.type));
  const pretty: Record<string, string> = {
    trim: "Trim",
    cut: "Cuts",
    silence_remove: "Silence cut",
    speed: "Speed",
    reframe: "Reframe",
    caption: "Captions",
    illustration: "Illustrations",
    transition: "Transitions",
  };
  return Array.from(types).map((t) => pretty[t] ?? t).join(", ");
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status.toUpperCase();
  if (status === "editing" || status === "rendering" || status === "analyzing") {
    return (
      <span className="inline-flex items-center px-2.5 py-1 bg-foreground text-foreground-inverse tag !text-foreground-inverse">
        {label}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center px-2.5 py-1 border border-accent tag !text-accent">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 border border-foreground tag !text-foreground">
      {label}
    </span>
  );
}

export default function ProjectsPage() {
  const { data: projects, isLoading, refetch } = trpc.project.list.useQuery(
    undefined,
    {
      // If ANY project is mid-way through a server-side process, poll every 3s
      // so the list stays in sync (status badge flips EDITING → SHIPPED, new
      // uploads appear automatically, etc).
      refetchInterval: (query) => {
        const list = query.state.data ?? [];
        const hasActive = list.some((p) =>
          ["uploading", "uploaded", "analyzing", "editing", "rendering"].includes(p.status)
        );
        return hasActive ? 3000 : false;
      },
      refetchOnWindowFocus: true,
    }
  );
  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Couldn't delete project");
    },
  });
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="font-mono text-sm italic text-muted-foreground">Loading projects…</span>
      </div>
    );
  }

  const total = projects?.length ?? 0;
  const shipped = projects?.filter((p) => p.status === "completed").length ?? 0;

  return (
    <div className="px-6 sm:px-10 lg:px-14 py-8 lg:py-12 max-w-[1180px]">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-7 lg:mb-9">
        <div className="flex flex-col gap-1">
          <span className="tag">
            {total === 0
              ? "No projects yet"
              : `${total} ${total === 1 ? "project" : "projects"} · ${shipped} shipped`}
          </span>
          <h1 className="text-[36px] sm:text-[44px] lg:text-[52px] font-heading font-normal tracking-[-0.028em] leading-none">
            Your projects
          </h1>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 bg-foreground text-foreground-inverse px-5 py-3.5 text-sm font-medium hover:bg-foreground/90 transition-colors w-fit"
        >
          New project <span aria-hidden>+</span>
        </Link>
      </header>

      {total === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="border-t border-foreground">
            {/* Desktop header row — hidden on mobile, shown at md+ */}
            <div className="hidden md:grid grid-cols-[32px_1fr_140px_100px_180px_72px] gap-6 py-3.5 border-b border-border">
              <span className="tag">#</span>
              <span className="tag">Project</span>
              <span className="tag">Status</span>
              <span className="tag">Length</span>
              <span className="tag">Updated</span>
              <span className="tag"></span>
            </div>
            {projects!.map((project, i) => {
              const n = total - i;
              const isFailed = project.status === "failed";
              const isUntitled = !project.title || project.title === "Untitled Project";
              return (
                <div
                  key={project.id}
                  className="group relative flex flex-col md:grid md:grid-cols-[32px_1fr_140px_100px_180px_72px] gap-2 md:gap-6 py-4 md:py-5 border-b border-border md:items-center hover:bg-muted/40 transition-colors"
                >
                  <Link
                    href={`/projects/${project.id}`}
                    aria-label={`Open ${project.title || "untitled project"}`}
                    className="absolute inset-0 z-0"
                  />
                  {/* Row 1 (mobile): number · relative time · status badge */}
                  <div className="flex md:hidden items-center justify-between gap-3 relative z-10 pointer-events-none">
                    <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
                      {n.toString().padStart(2, "0")} · {formatRelative(project.updatedAt ?? project.createdAt)}
                    </span>
                    <StatusBadge status={project.status} />
                  </div>
                  {/* Desktop: number column */}
                  <span className="hidden md:inline font-mono text-[13px] text-muted-foreground relative z-10 pointer-events-none">
                    {n.toString().padStart(2, "0")}
                  </span>
                  {/* Project title + subtitle */}
                  <div className="flex flex-col gap-0.5 relative z-10 pointer-events-none">
                    <span
                      className={cn(
                        "font-heading text-[18px] md:text-[19px] tracking-[-0.015em] leading-tight",
                        isUntitled && "italic text-muted-foreground"
                      )}
                    >
                      {project.title || "Untitled project"}
                    </span>
                    <span
                      className={cn(
                        "text-[13px]",
                        isFailed ? "text-accent" : "text-muted-foreground"
                      )}
                    >
                      {isFailed
                        ? "Render failed · tap to retry"
                        : `${opsSummary(project)} · ${formatDuration(project.sourceVideoDuration)}`}
                    </span>
                  </div>
                  {/* Desktop-only columns: status / length / updated */}
                  <div className="hidden md:block relative z-10 pointer-events-none">
                    <StatusBadge status={project.status} />
                  </div>
                  <span className="hidden md:inline font-mono text-[13px] relative z-10 pointer-events-none">
                    {formatDuration(project.sourceVideoDuration)}
                  </span>
                  <span className="hidden md:inline text-[13px] text-muted-foreground relative z-10 pointer-events-none">
                    {formatRelative(project.updatedAt ?? project.createdAt)}
                  </span>
                  {/* Delete action — visible on mobile, hover-reveal on desktop */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPendingDelete({
                        id: project.id,
                        title: project.title || "Untitled project",
                      });
                    }}
                    aria-label={`Delete ${project.title || "project"}`}
                    className="relative z-10 self-start md:self-center md:justify-self-end font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground hover:text-accent transition-opacity md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-12 flex flex-col gap-1.5 max-w-xl">
            <span className="tag">Empty state invitation</span>
            <p className="font-heading italic text-[20px] tracking-[-0.015em] leading-[1.45]">
              Got a clip lying in your Downloads folder? Drop it in. First render is on your own key.
            </p>
          </div>
        </>
      )}

      <ConfirmDeleteDialog
        project={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            deleteProject.mutate({ id: pendingDelete.id });
            setPendingDelete(null);
          }
        }}
        pending={deleteProject.isPending}
      />
    </div>
  );
}

function ConfirmDeleteDialog({
  project,
  onCancel,
  onConfirm,
  pending,
}: {
  project: { id: string; title: string } | null;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  useEffect(() => {
    if (!project) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [project, onCancel]);

  if (!project) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-surface-inverse/70 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-[480px] bg-background border border-foreground flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-8 pb-5 flex flex-col gap-2">
          <span className="tag !text-accent">Delete project</span>
          <h2
            id="delete-dialog-title"
            className="font-heading text-[30px] tracking-[-0.022em] leading-[1.1]"
          >
            Delete &ldquo;{project.title}&rdquo;?
          </h2>
          <p className="text-[14px] text-muted-foreground leading-[1.55] mt-1">
            This removes the project, its edit plan, and the rendered output from our server.
            The source file and render will be gone. This cannot be undone.
          </p>
        </div>
        <div className="px-8 py-5 border-t border-border flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-5 py-2.5 text-[13px] hover:bg-muted transition-colors disabled:opacity-40"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            autoFocus
            className="inline-flex items-center gap-2 border border-accent text-accent px-5 py-2.5 text-[13px] font-medium hover:bg-accent hover:text-foreground-inverse transition-colors disabled:opacity-40"
          >
            {pending ? "Deleting…" : <>Delete permanently <span aria-hidden>→</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-t border-foreground pt-16 flex flex-col items-start gap-6 max-w-xl">
      <span className="tag">Your first render</span>
      <h2 className="font-heading text-[36px] tracking-[-0.022em] leading-[1.1]">
        Upload a talking head. Describe the edit. Ship a vertical video.
      </h2>
      <p className="text-base text-muted-foreground leading-[1.55]">
        ClipForge trims dead air, speeds up slow bits, drops in karaoke captions, reframes for TikTok,
        and fills the screen with real photos of whatever you mention. Your keys, your cost.
      </p>
      <Link
        href="/projects/new"
        className="inline-flex items-center gap-2 bg-foreground text-foreground-inverse px-6 py-4 text-base font-medium hover:bg-foreground/90 transition-colors"
      >
        Start your first edit <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
