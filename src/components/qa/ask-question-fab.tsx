"use client";

import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import type { QaContextProps } from "@/types/qa";
import { AskQuestionDrawer } from "./ask-question-drawer";

interface AskQuestionFabProps extends QaContextProps {
  /** Smaller variant for inside QCM questions */
  mini?: boolean;
}

export function AskQuestionFab({ mini, ...contextProps }: AskQuestionFabProps) {
  const [open, setOpen] = useState(false);

  if (mini) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs
            text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
          title="Poser une question"
        >
          <MessageCircleQuestion className="w-3.5 h-3.5" />
        </button>

        {open && (
          <AskQuestionDrawer
            {...contextProps}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full
          bg-[#0e1e35] text-white shadow-lg shadow-gray-900/20
          hover:bg-[#1a2d4a] hover:scale-105 active:scale-95
          transition-all duration-200 flex items-center justify-center
          group"
        title="Poser une question"
      >
        <MessageCircleQuestion className="w-6 h-6 group-hover:scale-110 transition-transform" />
      </button>

      {open && (
        <AskQuestionDrawer
          {...contextProps}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
