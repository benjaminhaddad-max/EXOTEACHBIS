"use client";

import type { QaMessage, QaSenderType } from "@/types/qa";
import { VoiceNotePlayer } from "./voice-note-player";
import { MediaPreview } from "./media-preview";
import { Check, CheckCheck, Bot, User, GraduationCap, Pencil, Trash2 } from "lucide-react";

interface ChatBubbleProps {
  message: QaMessage;
  /** Who is viewing — determines left/right alignment */
  viewerRole: "student" | "prof";
  showAvatar?: boolean;
  senderName?: string;
  /** Called when student wants to edit their message */
  onEdit?: (message: QaMessage) => void;
  /** Called when student wants to delete their message */
  onDelete?: (messageId: string) => void;
  /** Whether edit/delete is allowed (e.g. prof hasn't responded yet) */
  canModify?: boolean;
}

export function ChatBubble({ message, viewerRole, showAvatar = true, senderName, onEdit, onDelete, canModify }: ChatBubbleProps) {
  const isMine =
    (viewerRole === "student" && message.sender_type === "student") ||
    (viewerRole === "prof" && message.sender_type === "prof");

  const isAi = message.sender_type === "ai";

  // Alignment
  const align = isMine ? "justify-end" : "justify-start";

  // Bubble colors (WhatsApp-like)
  const bubbleBg = isMine
    ? "bg-[#0e1e35] text-white"
    : isAi
    ? "bg-gradient-to-br from-blue-50 to-indigo-50 text-gray-800 border border-blue-100"
    : "bg-white text-gray-800 border border-gray-100 shadow-sm";

  const bubbleRadius = isMine
    ? "rounded-2xl rounded-br-md"
    : "rounded-2xl rounded-bl-md";

  // Timestamp
  const time = new Date(message.created_at).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Read receipts (only for own messages)
  const isRead =
    (viewerRole === "student" && message.read_by_prof) ||
    (viewerRole === "prof" && message.read_by_student);

  // Avatar
  const avatarIcon = isAi ? Bot : message.sender_type === "prof" ? GraduationCap : User;
  const avatarBg = isAi ? "bg-blue-100 text-blue-600" : message.sender_type === "prof" ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-500";

  const accent: "student" | "ai" | "prof" = isMine
    ? viewerRole === "prof" ? "prof" : "student"
    : isAi
    ? "ai"
    : message.sender_type === "prof"
    ? "prof"
    : "student";

  return (
    <div className={`flex ${align} gap-2 px-3 group`}>
      {/* Left avatar (not mine) */}
      {!isMine && showAvatar && (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-auto ${avatarBg}`}>
          {(() => { const Icon = avatarIcon; return <Icon className="w-3.5 h-3.5" />; })()}
        </div>
      )}
      {!isMine && !showAvatar && <div className="w-7 shrink-0" />}

      <div className={`max-w-[75%] min-w-[80px] ${bubbleBg} ${bubbleRadius} px-3 py-2`}>
        {/* Sender name */}
        {!isMine && senderName && (
          <p className={`text-[10px] font-semibold mb-0.5 ${isAi ? "text-blue-500" : "text-purple-500"}`}>
            {isAi ? "Assistant IA" : senderName}
          </p>
        )}

        {/* Content */}
        {message.content_type === "text" && message.content && (
          <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {isAi ? (
              <div
                className="prose prose-sm max-w-none [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:my-0.5 [&_p]:my-1"
                dangerouslySetInnerHTML={{
                  __html: message.content
                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                    .replace(/\*(.*?)\*/g, "<em>$1</em>")
                    .replace(/^- (.+)$/gm, "<li>$1</li>")
                    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
                    .replace(/\n/g, "<br/>"),
                }}
              />
            ) : (
              message.content
            )}
          </div>
        )}

        {message.content_type === "voice" && message.media_url && (
          <VoiceNotePlayer
            url={message.media_url}
            duration={message.media_duration_s}
            accent={isMine ? (viewerRole === "prof" ? "prof" : "student") : accent}
          />
        )}

        {message.content_type === "image" && message.media_url && (
          <MediaPreview url={message.media_url} type="image" accent={accent} />
        )}

        {message.content_type === "video" && message.media_url && (
          <MediaPreview url={message.media_url} type="video" accent={accent} />
        )}

        {/* Timestamp + read receipt */}
        <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : "justify-end"}`}>
          <span className={`text-[10px] ${isMine ? "text-white/50" : "text-gray-400"}`}>
            {time}
          </span>
          {isMine && (
            isRead ? (
              <CheckCheck className={`w-3.5 h-3.5 ${isMine ? "text-blue-300" : "text-blue-400"}`} />
            ) : (
              <Check className={`w-3.5 h-3.5 ${isMine ? "text-white/40" : "text-gray-300"}`} />
            )
          )}
        </div>
      </div>

      {/* Edit/Delete buttons (hover, only for own student messages that can be modified) */}
      {isMine && canModify && message.sender_type === "student" && message.content_type === "text" && (
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-center">
          {onEdit && (
            <button
              onClick={() => onEdit(message)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              title="Modifier"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(message.id)}
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
              title="Supprimer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Right spacer (mine, no avatar) */}
      {isMine && !canModify && <div className="w-7 shrink-0" />}
    </div>
  );
}
