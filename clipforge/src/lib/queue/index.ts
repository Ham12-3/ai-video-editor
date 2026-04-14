import { Queue } from "bullmq";
import { getRedisConnection } from "./redis";

let videoProcessingQueue: Queue | null = null;

export function getVideoProcessingQueue(): Queue {
  if (!videoProcessingQueue) {
    videoProcessingQueue = new Queue("video-processing", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: {
          count: 100,
        },
        removeOnFail: {
          count: 50,
        },
      },
    });
  }
  return videoProcessingQueue;
}

export interface VideoProcessingJobData {
  projectId: string;
  userId: string;
  type: "analyze" | "render";
}
