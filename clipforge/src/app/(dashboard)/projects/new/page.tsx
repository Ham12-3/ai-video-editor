"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/validators";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("Untitled project");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((f: File): string | null => {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      return `Unsupported file type. Accepted: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    if (f.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`;
    }
    return null;
  }, []);

  const handleFileSelect = useCallback(
    (f: File) => {
      const error = validateFile(f);
      if (error) {
        toast.error(error);
        return;
      }
      setFile(f);
      if (title === "Untitled project") {
        const base = f.name.replace(/\.[^.]+$/, "");
        setTitle(base.slice(0, 60));
      }
    },
    [validateFile, title]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);

      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      });
      const result = await new Promise<{ projectId: string }>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || "Upload failed"));
            } catch {
              reject(new Error("Upload failed"));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", "/api/upload");
        xhr.send(formData);
      });
      toast.success("Video uploaded");
      router.push(`/projects/${result.projectId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="px-14 py-12 max-w-[960px]">
      <header className="flex flex-col gap-1.5 mb-9">
        <Link href="/projects" className="tag hover:text-foreground transition-colors w-fit">
          ← Projects · New
        </Link>
        <h1 className="text-[52px] font-heading font-normal tracking-[-0.028em] leading-none">
          New project.
        </h1>
        <p className="text-sm text-muted-foreground leading-[1.55] max-w-xl mt-2">
          Upload a video. MP4, MOV, WebM, or AVI up to {formatFileSize(MAX_FILE_SIZE)}. Give it a
          name worth remembering.
        </p>
      </header>

      <div className="flex flex-col gap-8">
        {/* Title */}
        <div className="flex flex-col gap-2">
          <label htmlFor="title" className="tag">
            Project title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Morning rant about the iPhone 17"
            className="w-full px-4 py-3.5 text-[18px] font-heading tracking-[-0.015em] bg-transparent border-b border-foreground focus:outline-none placeholder:text-muted-foreground/60 placeholder:italic placeholder:font-normal"
          />
        </div>

        {/* Dropzone */}
        <div className="flex flex-col gap-2">
          <span className="tag">Source video</span>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload video"
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => {
              if (!uploading) fileInputRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (!uploading && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={cn(
              "cursor-pointer border transition-colors",
              dragActive ? "border-foreground bg-muted" : "border-border hover:border-foreground"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
            {file ? (
              <div className="flex items-center justify-between gap-6 px-8 py-10">
                <div className="flex flex-col gap-1.5">
                  <span className="tag">Ready to upload</span>
                  <span className="font-heading text-[22px] tracking-[-0.015em]">{file.name}</span>
                  <span className="font-mono text-[13px] text-muted-foreground">
                    {formatFileSize(file.size)} · {file.type || "video"}
                  </span>
                </div>
                {!uploading && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="text-[12px] tag hover:!text-accent transition-colors"
                  >
                    Remove ×
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2.5 px-8 py-16">
                <span className="tag">Drop zone</span>
                <p className="font-heading text-[26px] tracking-[-0.015em] leading-[1.2]">
                  Drop your video here, or click to browse.
                </p>
                <p className="text-[13px] text-muted-foreground">
                  MP4 · MOV · WebM · AVI · up to {formatFileSize(MAX_FILE_SIZE)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        {uploading && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="tag">Uploading</span>
              <span className="font-mono text-[13px]">{progress}%</span>
            </div>
            <div className="w-full h-[3px] bg-border">
              <div
                className="h-full bg-foreground transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="inline-flex items-center gap-2.5 bg-foreground text-foreground-inverse px-6 py-4 text-[15px] font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40"
          >
            {uploading ? "Uploading…" : "Upload and continue"}
            {!uploading && <span aria-hidden>→</span>}
          </button>
          <Link
            href="/projects"
            className="inline-flex items-center px-5 py-4 text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
