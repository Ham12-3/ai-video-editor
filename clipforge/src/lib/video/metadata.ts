import ffmpeg from "fluent-ffmpeg";

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
}

export function extractMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = data.streams.find((s) => s.codec_type === "video");
      if (!videoStream) {
        reject(new Error("No video stream found"));
        return;
      }

      const fpsStr = videoStream.r_frame_rate ?? "30/1";
      const [num, den] = fpsStr.split("/").map(Number);

      resolve({
        duration: data.format.duration ?? 0,
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        fps: den ? num / den : 30,
        codec: videoStream.codec_name ?? "unknown",
        bitrate: data.format.bit_rate ? Number(data.format.bit_rate) : 0,
      });
    });
  });
}

export function generateThumbnail(
  inputPath: string,
  outputDir: string,
  timestampSeconds: number = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [timestampSeconds],
        filename: "thumbnail.jpg",
        folder: outputDir,
        size: "480x?",
      })
      .on("end", () => resolve(`${outputDir}/thumbnail.jpg`))
      .on("error", reject);
  });
}
