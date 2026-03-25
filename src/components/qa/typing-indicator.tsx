"use client";

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 px-4 py-1">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-2">
        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        <span className="text-xs text-blue-500 ml-1">L&apos;IA réfléchit...</span>
      </div>
    </div>
  );
}
