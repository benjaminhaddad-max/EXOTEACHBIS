"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Loader2, Calendar, Search, X, Check, CheckCheck, Image as ImageIcon, Link2, FileText, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { QaMessage, QaThread } from "@/types/qa";
import type { Profile } from "@/types/database";
import { ChatInputBar } from "@/components/qa/chat-input-bar";
import { VoiceNotePlayer } from "@/components/qa/voice-note-player";
import { MediaPreview } from "@/components/qa/media-preview";
import { useQaRealtime } from "@/hooks/use-qa-realtime";

interface CoachingChatSectionProps {
  currentProfile: Profile;
  universityName: string;
  initialThread: QaThread | null;
  coaches: Profile[];
  onRequestRdv: () => void;
}

const API_URL = "/api/qa/coaching-thread";

const WA_DOODLE = `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='p' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Cpath d='M20 2a2 2 0 110 4 2 2 0 010-4zM6 14l4-4M30 14l4-4M14 30l-4 4M34 30l-4 4M2 20h4M34 20h4M20 34v4M20 2v4' stroke='%23000' stroke-opacity='.04' fill='none' stroke-width='.7'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='200' height='200' fill='url(%23p)'/%3E%3C/svg%3E")`;

async function callApi(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Erreur inattendue.");
  return data;
}

function getInitials(p: Profile): string { return ((p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "")).toUpperCase() || "?"; }
function getFullName(p: Profile): string { return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email; }
function formatTime(d: string) { return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }
function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr); const today = new Date(); const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// Extract URLs from text
function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) ?? [];
}

export function CoachingChatSection({ currentProfile, universityName, initialThread, coaches, onRequestRdv }: CoachingChatSectionProps) {
  const userId = currentProfile.id;
  const [thread, setThread] = useState<QaThread | null>(initialThread);
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [loading, setLoading] = useState(!!initialThread);
  const [sending, setSending] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [mediaTab, setMediaTab] = useState<"medias" | "liens" | "docs">("medias");
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const mainCoach = coaches[0] ?? null;
  const coachName = mainCoach ? getFullName(mainCoach) : "Coach Diploma Santé";
  const coachInitials = mainCoach ? getInitials(mainCoach) : "DS";

  const profileMap = new Map<string, Profile>();
  profileMap.set(currentProfile.id, currentProfile);
  for (const c of coaches) profileMap.set(c.id, c);

  useEffect(() => {
    if (!thread) { setLoading(false); return; }
    (async () => {
      try { const result = await callApi("get_messages", { threadId: thread.id }); setMessages(result.messages ?? []); }
      catch (err) { console.error("Load error:", err); }
      finally { setLoading(false); }
    })();
  }, [thread?.id]);

  useQaRealtime(thread?.id ?? null, useCallback((msg: QaMessage) => {
    setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
    supabase.from("qa_messages").update({ read_by_student: true }).eq("id", msg.id);
  }, [supabase]));

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  // ─── Media panel data ───
  const mediaMessages = useMemo(() => messages.filter(m => m.content_type === "image" || m.content_type === "video"), [messages]);
  const linkMessages = useMemo(() => {
    return messages.filter(m => m.content_type === "text" && m.content && extractUrls(m.content).length > 0)
      .flatMap(m => extractUrls(m.content!).map(url => ({ url, date: m.created_at, sender: m.sender_type })));
  }, [messages]);
  const docMessages = useMemo(() => messages.filter(m => m.media_url && (m.media_url.endsWith(".pdf") || m.media_url.endsWith(".doc") || m.media_url.endsWith(".docx") || m.media_url.endsWith(".xls") || m.media_url.endsWith(".xlsx"))), [messages]);

  // ─── Send handlers ───
  const handleSendText = async (text: string) => {
    setSending(true);
    try {
      if (!thread) { const result = await callApi("create_thread", { text }); setThread(result.thread); setMessages(result.message ? [result.message] : []); }
      else {
        const optimistic: QaMessage = { id: crypto.randomUUID(), thread_id: thread.id, sender_id: userId, sender_type: "student", content_type: "text", content: text, media_url: null, media_duration_s: null, read_by_student: true, read_by_prof: false, created_at: new Date().toISOString() };
        setMessages((prev) => [...prev, optimistic]);
        const result = await callApi("send_message", { threadId: thread.id, text });
        if (result.message) setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? result.message : m)));
      }
    } catch (err) { console.error("Send error:", err); } finally { setSending(false); }
  };

  const ensureThread = async (): Promise<string | null> => {
    if (thread) return thread.id;
    try { const result = await callApi("create_thread", { text: "📎" }); if (result.thread) { setThread(result.thread); if (result.message) setMessages([result.message]); return result.thread.id; } }
    catch (err) { console.error("Thread error:", err); } return null;
  };

  const handleSendVoice = async (blob: Blob, duration: number) => {
    setSending(true);
    try {
      const threadId = await ensureThread(); if (!threadId) { setSending(false); return; }
      const storagePath = `voice/${threadId}/${Date.now()}.webm`;
      const { error: uploadErr } = await supabase.storage.from("qa-media").upload(storagePath, blob, { contentType: blob.type || "audio/webm", upsert: true });
      if (uploadErr) { setSending(false); return; }
      const { data: urlData } = supabase.storage.from("qa-media").getPublicUrl(storagePath);
      await callApi("send_message", { threadId, text: "", contentType: "voice", mediaUrl: urlData.publicUrl, mediaDuration: Math.round(duration) });
    } catch (err) { console.error("Voice error:", err); } finally { setSending(false); }
  };

  const handleSendMedia = async (file: File, type: "image" | "video" | "document") => {
    setSending(true);
    try {
      const threadId = await ensureThread(); if (!threadId) { setSending(false); return; }
      const ext = file.name.split(".").pop() || "bin";
      const storagePath = `${type}/${threadId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("qa-media").upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: true });
      if (uploadErr) { setSending(false); return; }
      const { data: urlData } = supabase.storage.from("qa-media").getPublicUrl(storagePath);
      await callApi("send_message", { threadId, text: "", contentType: type === "document" ? "image" : type, mediaUrl: urlData.publicUrl });
    } catch (err) { console.error("Media error:", err); } finally { setSending(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center rounded-xl bg-gray-100" style={{ height: "calc(100vh - 200px)" }}><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  // Date separators
  const items: any[] = [];
  let lastDate = "";
  for (const msg of messages) {
    const d = new Date(msg.created_at).toDateString();
    if (d !== lastDate) { items.push({ type: "date", label: formatDateSeparator(msg.created_at), key: `date-${d}` }); lastDate = d; }
    items.push({ type: "msg", msg, key: msg.id });
  }

  const filteredItems = searchQuery
    ? items.filter((it: any) => it.type === "date" || (it.msg?.content?.toLowerCase().includes(searchQuery.toLowerCase())))
    : items;

  return (
    <div className="flex rounded-xl overflow-hidden shadow-lg border border-gray-200" style={{ height: "calc(100vh - 200px)", minHeight: 500 }}>
      {/* ─── Main chat column ─── */}
      <div className={`flex flex-col flex-1 min-w-0 ${showMediaPanel ? "hidden md:flex" : ""}`}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 shrink-0" style={{ backgroundColor: "#075E54" }}>
          <button onClick={() => setShowMediaPanel(true)} className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 overflow-hidden hover:ring-2 hover:ring-white/30 transition-all" style={{ backgroundColor: "#128C7E" }}>
            {mainCoach?.avatar_url ? <img src={mainCoach.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" /> : coachInitials}
          </button>
          <button onClick={() => setShowMediaPanel(true)} className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-white truncate">{coachName}</p>
            <p className="text-[11px] text-green-200 truncate">Coach {universityName ? `· ${universityName}` : "· Diploma Santé"}</p>
          </button>
          <div className="flex items-center gap-1">
            <button onClick={onRequestRdv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors hover:bg-white/15" style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "white" }}>
              <Calendar size={14} /> Prendre RDV
            </button>
            <button onClick={() => setSearchOpen(!searchOpen)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <Search size={18} className="text-white" />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[#064E47] shrink-0">
            <Search size={14} className="text-green-200 shrink-0" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus placeholder="Rechercher dans la conversation..."
              className="flex-1 bg-transparent text-sm text-white placeholder-green-200/50 focus:outline-none" />
            <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="p-1 rounded-full hover:bg-white/10"><X size={14} className="text-green-200" /></button>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-2" style={{ backgroundColor: "#ECE5DD", backgroundImage: WA_DOODLE }}>
          <div>
            {messages.length === 0 && !thread && (
              <div className="flex flex-col items-center justify-center gap-4 px-6" style={{ minHeight: "calc(100vh - 350px)" }}>
                <div className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden" style={{ backgroundColor: "#128C7E" }}>
                  {mainCoach?.avatar_url ? <img src={mainCoach.avatar_url} alt="" className="w-20 h-20 object-cover" /> : <span className="text-2xl font-bold text-white">{coachInitials}</span>}
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-gray-800">{coachName}</p>
                  <p className="text-sm text-gray-500 mt-1">Coach {universityName ? `· ${universityName}` : "· Diploma Santé"}</p>
                </div>
                <div className="rounded-lg px-4 py-2 mt-2 max-w-xs text-center bg-white/80 shadow-sm">
                  <p className="text-xs text-gray-600">Envoie un message pour démarrer la conversation avec ton coach.</p>
                </div>
              </div>
            )}

            {filteredItems.map((item: any) => {
              if (item.type === "date") {
                return <div key={item.key} className="flex justify-center my-3"><span className="px-3 py-1 rounded-lg text-[11px] font-medium bg-white/90 text-gray-600 shadow-sm">{item.label}</span></div>;
              }
              const msg = item.msg as QaMessage;
              const isMine = msg.sender_type === "student";
              const senderProfile = msg.sender_id ? profileMap.get(msg.sender_id) : null;

              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} px-3 mb-1`}>
                  {!isMine && <div className="w-0 h-0 shrink-0" style={{ borderTop: "8px solid white", borderLeft: "8px solid transparent", marginTop: "auto", marginBottom: 4 }} />}
                  <div className={`max-w-[75%] min-w-[80px] px-2.5 py-1.5 shadow-sm ${isMine ? "rounded-lg rounded-br-none bg-[#d9fdd3]" : "rounded-lg rounded-bl-none bg-white"}`}>
                    {!isMine && senderProfile && <p className="text-[11px] font-semibold mb-0.5" style={{ color: "#075E54" }}>{getFullName(senderProfile)}</p>}
                    {msg.content_type === "text" && msg.content && <p className="text-[13.5px] text-gray-900 leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>}
                    {msg.content_type === "voice" && msg.media_url && <VoiceNotePlayer url={msg.media_url} duration={msg.media_duration_s} accent={isMine ? "student" : "prof"} />}
                    {msg.content_type === "image" && msg.media_url && <MediaPreview url={msg.media_url} type="image" accent={isMine ? "student" : "prof"} />}
                    {msg.content_type === "video" && msg.media_url && <MediaPreview url={msg.media_url} type="video" accent={isMine ? "student" : "prof"} />}
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      <span className="text-[10px] text-gray-500">{formatTime(msg.created_at)}</span>
                      {isMine && <CheckCheck size={14} className="text-gray-400" />}
                    </div>
                  </div>
                  {isMine && <div className="w-0 h-0 shrink-0" style={{ borderTop: "8px solid #d9fdd3", borderRight: "8px solid transparent", marginTop: "auto", marginBottom: 4 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 bg-[#f0f2f5] border-t border-gray-200">
          <ChatInputBar onSendText={handleSendText} onSendVoice={handleSendVoice} onSendMedia={handleSendMedia} disabled={sending} placeholder="Message" />
        </div>
      </div>

      {/* ─── Media/Liens/Docs Panel (slide from right) ─── */}
      {showMediaPanel && (
        <div className="w-full md:w-[340px] shrink-0 flex flex-col bg-[#f0f2f5] border-l border-gray-200">
          {/* Panel header */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0 bg-white border-b border-gray-200">
            <button onClick={() => setShowMediaPanel(false)} className="p-1 rounded-full hover:bg-gray-100"><ArrowLeft size={18} className="text-gray-600" /></button>
            <span className="text-sm font-semibold text-gray-900">Infos du contact</span>
          </div>

          {/* Coach profile card */}
          <div className="flex flex-col items-center py-6 bg-white border-b border-gray-200">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-3 overflow-hidden" style={{ backgroundColor: "#128C7E" }}>
              {mainCoach?.avatar_url ? <img src={mainCoach.avatar_url} alt="" className="w-20 h-20 object-cover" /> : coachInitials}
            </div>
            <p className="text-base font-semibold text-gray-900">{coachName}</p>
            <p className="text-xs text-gray-500">Coach {universityName ? `· ${universityName}` : "· Diploma Santé"}</p>
          </div>

          {/* Tabs: Médias / Liens / Doc. */}
          <div className="flex bg-white border-b border-gray-200">
            {([
              { key: "medias" as const, label: "Médias", icon: <ImageIcon size={14} /> },
              { key: "liens" as const, label: "Liens", icon: <Link2 size={14} /> },
              { key: "docs" as const, label: "Doc.", icon: <FileText size={14} /> },
            ]).map(t => (
              <button key={t.key} onClick={() => setMediaTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-b-2 ${mediaTab === t.key ? "border-[#075E54] text-[#075E54]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {mediaTab === "medias" && (
              mediaMessages.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8">Aucun média partagé</p>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {mediaMessages.map(msg => (
                    <a key={msg.id} href={msg.media_url!} target="_blank" rel="noopener noreferrer" className="aspect-square rounded overflow-hidden bg-gray-200 hover:opacity-80 transition-opacity">
                      {msg.content_type === "image" ? (
                        <img src={msg.media_url!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <video src={msg.media_url!} className="w-full h-full object-cover" />
                      )}
                    </a>
                  ))}
                </div>
              )
            )}

            {mediaTab === "liens" && (
              linkMessages.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8">Aucun lien partagé</p>
              ) : (
                <div className="space-y-2">
                  {linkMessages.map((link, i) => (
                    <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                      <Link2 size={14} className="text-[#075E54] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-[#075E54] truncate">{link.url}</p>
                        <p className="text-[10px] text-gray-400">{new Date(link.date).toLocaleDateString("fr-FR")}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )
            )}

            {mediaTab === "docs" && (
              docMessages.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8">Aucun document partagé</p>
              ) : (
                <div className="space-y-2">
                  {docMessages.map(msg => (
                    <a key={msg.id} href={msg.media_url!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                      <FileText size={14} className="text-orange-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-700 truncate">{msg.media_url!.split("/").pop()}</p>
                        <p className="text-[10px] text-gray-400">{new Date(msg.created_at).toLocaleDateString("fr-FR")}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
