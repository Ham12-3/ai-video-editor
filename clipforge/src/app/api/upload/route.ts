import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { ALLOWED_VIDEO_TYPES, MAX_FILE_SIZE } from "@/lib/validators";

// Allow large uploads (Next.js route segment config)
export const maxDuration = 300; // 5 minutes timeout for large uploads

// Magic bytes for video formats
const VIDEO_SIGNATURES: Record<string, number[][]> = {
  "video/mp4": [
    [0x00, 0x00, 0x00], // ftyp box (check at offset 4)
  ],
  "video/quicktime": [
    [0x00, 0x00, 0x00], // ftyp box
  ],
  "video/webm": [
    [0x1a, 0x45, 0xdf, 0xa3], // EBML header
  ],
  "video/x-msvideo": [
    [0x52, 0x49, 0x46, 0x46], // RIFF header
  ],
};

function validateMagicBytes(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 16));

  // Check for ftyp box (MP4/MOV) at offset 4
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return true;
  }

  // Check EBML header (WebM)
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return true;
  }

  // Check RIFF header (AVI)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "Untitled Project";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_VIDEO_TYPES.includes(file.type as typeof ALLOWED_VIDEO_TYPES[number])) {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 500MB." },
        { status: 400 }
      );
    }

    // Validate magic bytes
    const buffer = await file.arrayBuffer();
    if (!validateMagicBytes(buffer)) {
      return NextResponse.json(
        { error: "File content does not match a supported video format" },
        { status: 400 }
      );
    }

    // Create project
    const [project] = await db
      .insert(projects)
      .values({
        userId: session.user.id,
        title,
        status: "uploading",
      })
      .returning();

    // Save file
    const uploadDir =
      process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
    const projectDir = join(uploadDir, session.user.id, project.id);
    await mkdir(projectDir, { recursive: true });

    const filePath = join(projectDir, "source.mp4");
    await writeFile(filePath, Buffer.from(buffer));

    // Extract metadata using FFmpeg
    let duration: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let fps: number | null = null;

    try {
      const ffprobe = await import("fluent-ffmpeg");
      const ffmpeg = ffprobe.default;

      const metadata = await new Promise<{
        duration: number;
        width: number;
        height: number;
        fps: number;
      }>((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err: Error | null, data: { format?: { duration?: number }; streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string }> }) => {
          if (err) {
            reject(err);
            return;
          }
          const videoStream = data.streams?.find(
            (s: { codec_type?: string }) => s.codec_type === "video"
          );
          const fpsStr = videoStream?.r_frame_rate ?? "30/1";
          const [num, den] = fpsStr.split("/").map(Number);
          resolve({
            duration: data.format?.duration ?? 0,
            width: videoStream?.width ?? 0,
            height: videoStream?.height ?? 0,
            fps: den ? num / den : 30,
          });
        });
      });

      duration = metadata.duration;
      width = metadata.width;
      height = metadata.height;
      fps = metadata.fps;

      // Generate thumbnail at 2-second mark
      const thumbnailPath = join(projectDir, "thumbnail.jpg");
      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .screenshots({
            timestamps: [Math.min(2, metadata.duration)],
            filename: "thumbnail.jpg",
            folder: projectDir,
            size: "480x?",
          })
          .on("end", () => resolve())
          .on("error", (err: Error) => reject(err));
      });

      // Update project with metadata
      await db
        .update(projects)
        .set({
          status: "uploaded",
          sourceVideoUrl: `/api/video/${session.user.id}/${project.id}/source.mp4`,
          sourceVideoDuration: duration,
          sourceVideoWidth: width,
          sourceVideoHeight: height,
          sourceVideoFps: fps,
          sourceVideoSize: file.size,
          thumbnailUrl: `/api/video/${session.user.id}/${project.id}/thumbnail.jpg`,
          updatedAt: new Date(),
        })
        .where(
          eq(projects.id, project.id)
        );
    } catch {
      // FFmpeg not available or failed, still save the project
      await db
        .update(projects)
        .set({
          status: "uploaded",
          sourceVideoUrl: `/api/video/${session.user.id}/${project.id}/source.mp4`,
          sourceVideoSize: file.size,
          updatedAt: new Date(),
        })
        .where(
          eq(projects.id, project.id)
        );
    }

    return NextResponse.json({ projectId: project.id });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
