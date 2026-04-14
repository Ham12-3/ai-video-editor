import { execSync } from "child_process";

export interface EncoderConfig {
  videoCodec: string;
  codecArgs: string[];
  label: string;
}

const SOFTWARE_ENCODER: EncoderConfig = {
  videoCodec: "libx264",
  codecArgs: ["-preset", "fast", "-crf", "23"],
  label: "libx264 (software, fast preset)",
};

const HW_ENCODERS: Array<{
  name: string;
  codec: string;
  config: EncoderConfig;
}> = [
  {
    name: "NVIDIA NVENC",
    codec: "h264_nvenc",
    config: {
      videoCodec: "h264_nvenc",
      codecArgs: ["-preset", "p4", "-rc", "vbr", "-cq", "23", "-b:v", "0"],
      label: "NVIDIA NVENC (hardware)",
    },
  },
  {
    name: "AMD AMF",
    codec: "h264_amf",
    config: {
      videoCodec: "h264_amf",
      codecArgs: ["-quality", "balanced", "-rc", "vbr_latency", "-qp_i", "23", "-qp_p", "23"],
      label: "AMD AMF (hardware)",
    },
  },
  {
    name: "Intel QSV",
    codec: "h264_qsv",
    config: {
      videoCodec: "h264_qsv",
      codecArgs: ["-preset", "fast", "-global_quality", "23"],
      label: "Intel QSV (hardware)",
    },
  },
];

let cachedEncoder: EncoderConfig | null = null;

/**
 * Detect the best available H.264 encoder.
 * Tests with a realistic resolution (720p) to catch drivers that only work on small frames.
 * Result is cached after first detection.
 */
export function detectBestEncoder(): EncoderConfig {
  if (cachedEncoder) return cachedEncoder;

  for (const hw of HW_ENCODERS) {
    try {
      // Test with 720p (realistic resolution) and actual encoding params
      execSync(
        `ffmpeg -y -f lavfi -i color=c=black:s=1280x720:d=0.5 -c:v ${hw.codec} ${hw.config.codecArgs.join(" ")} -f null -`,
        { stdio: "pipe", timeout: 10000 }
      );
      console.log(`[hwaccel] Detected and verified: ${hw.name} (${hw.codec})`);
      cachedEncoder = hw.config;
      return cachedEncoder;
    } catch {
      console.log(`[hwaccel] ${hw.name} not available or failed verification`);
    }
  }

  console.log(`[hwaccel] Using software encoder (libx264 fast preset)`);
  cachedEncoder = SOFTWARE_ENCODER;
  return cachedEncoder;
}

/**
 * Get FFmpeg args for the detected encoder.
 */
export function getEncoderArgs(): string[] {
  const encoder = detectBestEncoder();
  return ["-c:v", encoder.videoCodec, ...encoder.codecArgs];
}

/**
 * Get the software fallback encoder args.
 * Used when hardware encoding fails at runtime.
 */
export function getSoftwareEncoderArgs(): string[] {
  return ["-c:v", SOFTWARE_ENCODER.videoCodec, ...SOFTWARE_ENCODER.codecArgs];
}

/**
 * Reset the cached encoder (forces re-detection on next call).
 * Call this if a hardware encoder fails at runtime.
 */
export function resetEncoderCache(): void {
  cachedEncoder = null;
}
