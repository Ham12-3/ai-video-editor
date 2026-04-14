/**
 * In-memory progress store for SSE streaming.
 * Maps projectId -> latest progress event.
 * In production, use Redis pub/sub instead.
 */

import type { ProgressEvent } from "@/types/events";

type Listener = (event: ProgressEvent) => void;

const listeners = new Map<string, Set<Listener>>();
const latestEvents = new Map<string, ProgressEvent>();

export function emitProgress(projectId: string, event: ProgressEvent) {
  latestEvents.set(projectId, event);
  const projectListeners = listeners.get(projectId);
  if (projectListeners) {
    for (const listener of projectListeners) {
      listener(event);
    }
  }
}

export function onProgress(projectId: string, listener: Listener): () => void {
  if (!listeners.has(projectId)) {
    listeners.set(projectId, new Set());
  }
  listeners.get(projectId)!.add(listener);

  // Send the latest event immediately if available
  const latest = latestEvents.get(projectId);
  if (latest) {
    listener(latest);
  }

  // Return unsubscribe function
  return () => {
    listeners.get(projectId)?.delete(listener);
    if (listeners.get(projectId)?.size === 0) {
      listeners.delete(projectId);
    }
  };
}

export function clearProgress(projectId: string) {
  latestEvents.delete(projectId);
  listeners.delete(projectId);
}
