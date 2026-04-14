import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stat, open } from "fs/promises";
import { join } from "path";
import { createReadStream } from "fs";
import { Readable } from "stream";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const [userId, projectId, ...rest] = path;
  const filename = rest.join("/");

  if (userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (filename.includes("..") || projectId.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
  const filePath = join(uploadDir, userId, projectId, filename);

  try {
    const fileStat = await stat(filePath);

    const ext = filename.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
      avi: "video/x-msvideo",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
    };
    const contentType = contentTypes[ext ?? ""] ?? "application/octet-stream";
    const range = request.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024, fileStat.size - 1);
      const chunkSize = end - start + 1;

      // Stream only the requested range, not the whole file
      const stream = createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(stream) as ReadableStream;

      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": contentType,
        },
      });
    }

    // No range: stream the full file
    const stream = createReadStream(filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Length": fileStat.size.toString(),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
