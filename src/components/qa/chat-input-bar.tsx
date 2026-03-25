"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Mic, MicOff, Paperclip, Image, Video, FileText, X } from "lucide-react";

interface ChatInputBarProps {
  onSendText: (text: string) => void;
  onSendVoice: (blob: Blob, duration: number) => void;
  onSendMedia: (file: File, type: "image" | "video" | "document") => void;
  disabled?: boolean;
  placeholder?: string;
  /** Pre-fill the input (e.g. when editing a message) */
  prefillText?: string;
}

export function ChatInputBar({
  onSendText,
  onSendVoice,
  onSendMedia,
  disabled,
  placeholder = "Votre message...",
  prefillText,
}: ChatInputBarProps) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [showAttach, setShowAttach] = useState(false);

  // Handle prefill from parent (e.g. editing a message)
  useEffect(() => {
    if (prefillText) {
      setText(prefillText);
      // Focus the textarea
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [prefillText]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-grow
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // Voice recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          onSendVoice(blob, recordDuration);
        }
        setRecordDuration(0);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordDuration(0);

      timerRef.current = setInterval(() => {
        setRecordDuration((d) => d + 1);
      }, 1000);
    } catch {
      console.error("Microphone access denied");
    }
  }, [onSendVoice, recordDuration]);

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      setIsRecording(false);
      setRecordDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "video" | "document") => {
    const file = e.target.files?.[0];
    if (file) {
      onSendMedia(file, type);
      setShowAttach(false);
    }
    e.target.value = "";
  };

  // Recording mode
  if (isRecording) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-t border-gray-100">
        <button
          onClick={cancelRecording}
          className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-red-600">
            Enregistrement... {formatDur(recordDuration)}
          </span>
        </div>

        <button
          onClick={stopRecording}
          className="w-10 h-10 rounded-full bg-[#0e1e35] text-white flex items-center justify-center hover:bg-[#1a2d4a] transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Attachment picker */}
      {showAttach && (
        <div className="absolute bottom-full left-4 mb-2 bg-white rounded-xl shadow-lg border border-gray-100 p-1.5 flex flex-col gap-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150 min-w-[140px]">
          <button
            onClick={() => { fileInputRef.current?.click(); setShowAttach(false); }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 text-gray-700 w-full"
          >
            <Image className="w-4 h-4 text-emerald-500" />
            Photo
          </button>
          <button
            onClick={() => { videoInputRef.current?.click(); setShowAttach(false); }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 text-gray-700 w-full"
          >
            <Video className="w-4 h-4 text-blue-500" />
            Vidéo
          </button>
          <button
            onClick={() => { pdfInputRef.current?.click(); setShowAttach(false); }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 text-gray-700 w-full"
          >
            <FileText className="w-4 h-4 text-red-500" />
            PDF
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-2 bg-white border-t border-gray-100">
        {/* Attach button */}
        <button
          onClick={() => setShowAttach(!showAttach)}
          disabled={disabled}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors shrink-0 mb-0.5"
        >
          <Paperclip className="w-4.5 h-4.5" />
        </button>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none bg-gray-50 rounded-2xl px-4 py-2.5 text-sm
            placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100
            max-h-[120px] border border-gray-100"
        />

        {/* Mic / Send button */}
        {text.trim() ? (
          <button
            onClick={handleSend}
            disabled={disabled}
            className="w-9 h-9 rounded-full bg-[#0e1e35] text-white flex items-center justify-center
              hover:bg-[#1a2d4a] transition-colors shrink-0 mb-0.5 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={disabled}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400
              hover:text-gray-600 hover:bg-gray-50 transition-colors shrink-0 mb-0.5"
          >
            <Mic className="w-4.5 h-4.5" />
          </button>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, "image")}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, "video")}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => handleFileSelect(e, "document")}
      />
    </div>
  );
}
