"use client";

import { Bot, ThumbsUp, UserRound } from "lucide-react";

interface AiResponseCardProps {
  content: string;
  onAccept: () => void;
  onEscalate: () => void;
  disabled?: boolean;
  resolved?: boolean;
}

export function AiResponseCard({
  content,
  onAccept,
  onEscalate,
  disabled,
  resolved,
}: AiResponseCardProps) {
  return (
    <div className="flex justify-start gap-2 px-3">
      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-auto">
        <Bot className="w-3.5 h-3.5" />
      </div>

      <div className="max-w-[80%] min-w-[200px]">
        {/* AI message bubble */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl rounded-bl-md px-4 py-3">
          <p className="text-[10px] font-semibold text-blue-500 mb-1">Assistant IA</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </p>
        </div>

        {/* Action buttons */}
        {!resolved && (
          <div className="flex gap-2 mt-2 ml-1">
            <button
              onClick={onAccept}
              disabled={disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                bg-emerald-50 text-emerald-700 border border-emerald-200
                hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              <ThumbsUp className="w-3 h-3" />
              Réponse satisfaisante
            </button>
            <button
              onClick={onEscalate}
              disabled={disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                bg-orange-50 text-orange-700 border border-orange-200
                hover:bg-orange-100 transition-colors disabled:opacity-50"
            >
              <UserRound className="w-3 h-3" />
              Je veux une réponse humaine
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
