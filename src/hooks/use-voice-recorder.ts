"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceRecorderResult {
  blob: Blob;
  duration: number;
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveStopRef = useRef<
    ((result: VoiceRecorderResult | null) => void) | null
  >(null);

  // Cleanup helper — stops tracks, clears timer, resets state.
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    // Reset any previous state
    cleanup();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // Choose a supported mime type
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const finalDuration = duration; // captured via closure at time of stop
      resolveStopRef.current?.({ blob, duration: finalDuration });
      resolveStopRef.current = null;
    };

    recorder.start();
    setIsRecording(true);
    setDuration(0);

    // Track duration with a 1-second interval
    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, [cleanup, duration]);

  const stopRecording = useCallback((): Promise<VoiceRecorderResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        resolve(null);
        return;
      }

      // We need to capture the current duration before stopping, because the
      // onstop handler fires asynchronously and state may have reset by then.
      const currentDuration =
        timerRef.current !== null ? Math.max(duration, 1) : 0;

      // Override the onstop to use the captured duration
      const mimeType = recorder.mimeType;
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        resolve({ blob, duration: currentDuration });

        // Cleanup after resolving
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        setIsRecording(false);
        setDuration(0);
      };

      recorder.stop();
    });
  }, [duration]);

  const cancelRecording = useCallback(() => {
    resolveStopRef.current?.(null);
    resolveStopRef.current = null;
    cleanup();
  }, [cleanup]);

  return {
    isRecording,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
