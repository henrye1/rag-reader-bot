import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface ProcessingDocument {
  documentId: string;
  startedAt: number; // Date.now() when we first started tracking
}

/**
 * Polls the documents API for any documents currently in "processing" status.
 * When a document transitions to "ready" or "error", fires the onStatusChange callback.
 * Stops polling a document after 5 minutes (safety valve).
 */
export function useDocumentStatusPoller(
  processingDocumentIds: string[],
  onStatusChange: (documentId: string, status: "ready" | "error", data: { totalChunks?: number; errorMessage?: string }) => void
) {
  const trackedRef = useRef<Map<string, ProcessingDocument>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Update tracked documents: add new ones, keep existing start times
    for (const docId of processingDocumentIds) {
      if (!trackedRef.current.has(docId)) {
        trackedRef.current.set(docId, { documentId: docId, startedAt: Date.now() });
      }
    }

    // Remove documents no longer in the processing list
    for (const docId of trackedRef.current.keys()) {
      if (!processingDocumentIds.includes(docId)) {
        trackedRef.current.delete(docId);
      }
    }

    // If nothing to poll, clear interval
    if (processingDocumentIds.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Start polling if not already
    if (intervalRef.current) return;

    intervalRef.current = setInterval(async () => {
      const tracked = Array.from(trackedRef.current.values());
      if (tracked.length === 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const now = Date.now();
      const idsToCheck: string[] = [];
      const expiredIds: string[] = [];

      for (const doc of tracked) {
        if (now - doc.startedAt > MAX_POLL_DURATION_MS) {
          expiredIds.push(doc.documentId);
        } else {
          idsToCheck.push(doc.documentId);
        }
      }

      // Handle expired documents
      for (const docId of expiredIds) {
        trackedRef.current.delete(docId);
        onStatusChange(docId, "error", { errorMessage: "Processing timed out after 5 minutes" });
      }

      if (idsToCheck.length === 0) return;

      const { data, error } = await apiFetch<{ id: string; status: string; total_chunks: number | null }[]>(
        "documents/status",
        { params: { ids: idsToCheck.join(",") } }
      );

      if (error) {
        console.error("Poller: failed to query document status", error);
        return;
      }

      for (const row of data || []) {
        if (row.status === "ready") {
          trackedRef.current.delete(row.id);
          onStatusChange(row.id, "ready", { totalChunks: row.total_chunks ?? undefined });
        } else if (row.status === "error") {
          trackedRef.current.delete(row.id);
          onStatusChange(row.id, "error", { errorMessage: "Processing failed on the server" });
        }
        // If still "processing", keep polling
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [processingDocumentIds, onStatusChange]);
}
