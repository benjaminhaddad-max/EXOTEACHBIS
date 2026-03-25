"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Returns the number of escalated Q&A threads with unread messages
 * for the currently logged-in professor.
 *
 * The count updates in real-time via Supabase Realtime subscriptions on
 * both `qa_threads` and `qa_messages`.
 */
export function useQaUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function fetchCount() {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get the matieres assigned to this professor
      const { data: profMatieres } = await supabase
        .from("prof_matieres")
        .select("matiere_id")
        .eq("prof_id", user.id);

      if (!profMatieres || profMatieres.length === 0) {
        setCount(0);
        return;
      }

      const matiereIds = profMatieres.map((pm) => pm.matiere_id);

      // Count escalated threads in these matieres that have at least one
      // message not yet read by the professor.
      const { count: unread, error } = await supabase
        .from("qa_threads")
        .select(
          "id, qa_messages!inner(id)",
          { count: "exact", head: true }
        )
        .eq("status", "escalated")
        .in("matiere_id", matiereIds)
        .eq("qa_messages.read_by_prof", false);

      if (!error) {
        setCount(unread ?? 0);
      }
    }

    // Initial fetch
    fetchCount();

    // Subscribe to changes that could affect the count:
    // - Thread status changes (e.g. new escalation or resolution)
    // - New messages or messages marked as read
    channel = supabase
      .channel("qa-unread-count")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qa_threads",
        },
        () => {
          fetchCount();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qa_messages",
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  return count;
}
