"use client";

import { useState } from "react";
import { Bell, Megaphone, MessageSquare, BookOpen, FileCheck, Check, CheckCheck } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: "annonce" | "forum_reply" | "nouveau_cours" | "examen";
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
};

const TYPE_ICONS: Record<string, any> = {
  annonce: Megaphone,
  forum_reply: MessageSquare,
  nouveau_cours: BookOpen,
  examen: FileCheck,
};

const TYPE_COLORS: Record<string, string> = {
  annonce: "bg-indigo-100 text-indigo-600",
  forum_reply: "bg-blue-100 text-blue-600",
  nouveau_cours: "bg-green-100 text-green-600",
  examen: "bg-red-100 text-red-600",
};

const TYPE_LABELS: Record<string, string> = {
  annonce: "Annonce",
  forum_reply: "Réponse forum",
  nouveau_cours: "Nouveau cours",
  examen: "Examen",
};

export function NotificationsShell({
  initialNotifications,
  userId,
}: {
  initialNotifications: Notification[];
  userId: string;
}) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    await sb.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await sb.from("notifications").update({ read: true }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {unreadCount > 0 ? (
            <><span className="font-semibold text-gray-900">{unreadCount}</span> non lue{unreadCount !== 1 ? "s" : ""}</>
          ) : (
            "Tout est à jour"
          )}
        </p>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <CheckCheck size={14} /> Tout marquer comme lu
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-navy/20 bg-navy/5 p-12 text-center">
          <Bell className="mx-auto h-12 w-12 text-navy/30" />
          <h3 className="mt-4 text-lg font-semibold text-navy">Aucune notification</h3>
          <p className="mt-2 text-sm text-gray-500">Vous serez notifié(e) des nouvelles annonces, réponses et cours.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? Bell;
            const iconColor = TYPE_COLORS[n.type] ?? "bg-gray-100 text-gray-500";
            const content = (
              <div
                className={cn(
                  "flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer",
                  n.read
                    ? "bg-white border-gray-200 hover:bg-gray-50"
                    : "bg-indigo-50/60 border-indigo-200 hover:bg-indigo-50"
                )}
                onClick={() => !n.read && markRead(n.id)}
              >
                <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", iconColor)}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {TYPE_LABELS[n.type]}
                      </span>
                      <p className={cn("text-sm font-semibold mt-0.5", n.read ? "text-gray-700" : "text-gray-900")}>
                        {n.title}
                      </p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                      )}
                      <time className="text-xs text-gray-400">
                        {new Date(n.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </time>
                    </div>
                  </div>
                </div>
              </div>
            );

            return n.link ? (
              <Link key={n.id} href={n.link} onClick={() => !n.read && markRead(n.id)}>
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
