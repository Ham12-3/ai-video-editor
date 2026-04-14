"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Film,
  X,
  FileVideo,
  Loader2,
} from "lucide-react";
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/validators";
import { toast } from "sonner";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("Untitled Project");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const validateFile = useCallback((f: File): string | null => {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
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
    },
    [validateFile]
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
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      const result = await new Promise<{ projectId: string }>(
        (resolve, reject) => {
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
        }
      );

      toast.success("Video uploaded successfully");
      router.push(`/projects/${result.projectId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Upload failed. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-2">New Project</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Upload a video to get started with AI editing
      </p>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Project title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My awesome video"
          />
        </div>

        {/* Drop zone */}
        <Card
          className={`border-dashed transition-colors cursor-pointer ${
            dragActive
              ? "border-primary bg-primary/5"
              : "hover:border-muted-foreground/30"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => {
            if (!uploading) {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ALLOWED_EXTENSIONS.join(",");
              input.onchange = (e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) handleFileSelect(f);
              };
              input.click();
            }
          }}
        >
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            {file ? (
              <>
                <div className="rounded-full bg-primary/10 p-3 mb-4">
                  <FileVideo className="h-6 w-6 text-primary" />
                </div>
                <p className="font-medium text-sm mb-1">{file.name}</p>
                <p className="text-xs text-muted-foreground mb-4">
                  {formatFileSize(file.size)}
                </p>
                {!uploading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="gap-1"
                  >
                    <X className="h-3 w-3" />
                    Remove
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="rounded-full bg-muted p-3 mb-4">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium text-sm mb-1">
                  Drop your video here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  MP4, MOV, WebM, or AVI. Max {formatFileSize(MAX_FILE_SIZE)}.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Upload progress */}
        {uploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Uploading...</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {/* Upload button */}
        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full gap-2"
          size="lg"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Film className="h-4 w-4" />
          )}
          {uploading ? "Uploading..." : "Upload and continue"}
        </Button>
      </div>
    </div>
  );
}
