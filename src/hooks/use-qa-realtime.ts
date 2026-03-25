"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QaMessage, QaThread } from "@/types/qa";

/**
 * Subscribe to Supabase Realtime for live Q&A thread updates.
 *
 * - Fires `onNewMessage` on every INSERT into `qa_messages` for the given thread.
 * - Fires `onStatusChange` on every UPDATE to the matching `qa_threads` row.
 * - Automatically cleans up subscriptions on unmount or when `threadId` changes.
 */
export function useQaRealtime(
  threadId: string | null,
  onNewMessage: (msg: QaMessage) => void,
  onStatusChange?: (thread: QaThread) => void
) {
  // Keep stable refs so the channel callback always sees the latest handler
  // without needing to re-subscribe on every render.
  const onNewMessageRef = useRef(onNewMessage);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    if (!threadId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`qa-thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "qa_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          onNewMessageRef.current(payload.new as QaMessage);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "qa_threads",
          filter: `id=eq.${threadId}`,
        },
        (payload) => {
          onStatusChangeRef.current?.(payload.new as QaThread);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);
}
