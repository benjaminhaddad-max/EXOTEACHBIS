"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell,
  Megaphone,
  BookOpen,
  FileCheck,
  MessageCircleQuestion,
  CheckCheck,
  X,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
};

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string; label: string }> = {
  annonce:          { icon: Megaphone,              color: "#6366F1", bg: "rgba(99,102,241,0.12)",  label: "Annonce" },
  nouveau_cours:    { icon: BookOpen,               color: "#22C55E", bg: "rgba(34,197,94,0.12)",   label: "Nouveau cours" },
  examen:           { icon: FileCheck,              color: "#EF4444", bg: "rgba(239,68,68,0.12)",   label: "Examen" },
  qa_prof_replied:  { icon: MessageCircleQuestion,  color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  label: "Réponse prof" },
  qa_escalated:     { icon: MessageCircleQuestion,  color: "#EC4899", bg: "rgba(236,72,153,0.12)",  label: "Question escaladée" },
  qa_ai_replied:    { icon: MessageCircleQuestion,  color: "#8B5CF6", bg: "rgba(139,92,246,0.12)",  label: "Réponse IA" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.max(0, now - d);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function NotificationBell() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) {
      setNotifications(data as Notification[]);
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const markRead = async (id: string) => {
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setNotifications((p) => p.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} className={open ? "text-navy" : "text-gray-500"} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[520px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-gray-200 z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <CheckCheck size={13} />
                  Tout lire
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Tabs-like filter */}
          {unreadCount > 0 && (
            <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-50">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-600">
                {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {!loaded ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-navy rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <Bell size={20} className="text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">Aucune notification</p>
                <p className="text-xs text-gray-400 mt-1">Tu seras notifié des nouveaux cours, annonces et réponses.</p>
              </div>
            ) : (
              <div>
                {notifications.map((n) => {
                  const config = TYPE_CONFIG[n.type] ?? { icon: Bell, color: "#6B7280", bg: "rgba(107,114,128,0.1)", label: n.type };
                  const Icon = config.icon;

                  const inner = (
                    <div
                      className={`flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer border-l-[3px] ${
                        n.read
                          ? "bg-white border-l-transparent hover:bg-gray-50"
                          : "bg-blue-50/40 border-l-blue-500 hover:bg-blue-50/60"
                      }`}
                      onClick={() => {
                        if (!n.read) markRead(n.id);
                        if (n.link) setOpen(false);
                      }}
                    >
                      {/* Icon */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: config.bg }}
                      >
                        <Icon size={16} style={{ color: config.color }} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: config.color }}
                          >
                            {config.label}
                          </span>
                          <span className="text-[10px] text-gray-400">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className={`text-[13px] leading-snug ${n.read ? "text-gray-600" : "text-gray-900 font-semibold"}`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                      </div>

                      {/* Unread dot + link indicator */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0 mt-1">
                        {!n.read && (
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                        )}
                        {n.link && (
                          <ExternalLink size={11} className="text-gray-300" />
                        )}
                      </div>
                    </div>
                  );

                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => { if (!n.read) markRead(n.id); setOpen(false); }}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="block text-center text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Voir toutes les notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
