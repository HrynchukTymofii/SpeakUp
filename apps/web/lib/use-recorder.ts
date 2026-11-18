"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Formats in order of preference. Chrome/Firefox/Edge support WebM+Opus; Safari only
 * supports MP4/AAC. All of them are on the API's allowlist (AUDIO_EXTENSIONS in @speakup/shared).
 */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export interface Recording {
  blob: Blob;
  /** Object URL for the <audio> preview. Revoked automatically on re-record/unmount. */
  url: string;
  mimeType: string;
  durationMs: number;
}

export type RecorderState =
  | { kind: "idle" }
  | { kind: "requesting" } // waiting for the user to answer the mic permission prompt
  | { kind: "recording"; elapsedMs: number }
  | { kind: "recorded"; recording: Recording }
  | { kind: "denied" } // user (or browser policy) blocked the microphone
  | { kind: "unsupported" } // no MediaRecorder / no supported format / no mic
  | { kind: "error"; message: string };

/**
 * Microphone recording with the browser's MediaRecorder API (SPEC §6.1): picks a supported
 * format, shows elapsed time, stops automatically at `maxDurationSec`, and allows re-recording.
 *
 * Resources that live outside React (the mic stream, the timer, object URLs) are kept in refs
 * and always released — otherwise the browser's "mic in use" indicator stays on.
 */
export function useRecorder(maxDurationSec: number) {
  const [state, setState] = useState<RecorderState>({ kind: "idle" });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  // Live input level for a meter (Web Audio). Read through getLevel(), not React state, so a
  // meter can update every animation frame without re-rendering the component.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const releaseMic = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    const mimeType = pickMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setState({ kind: "unsupported" });
      return;
    }
    revokePreview();
    setState({ kind: "requesting" });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") setState({ kind: "denied" });
      else if (name === "NotFoundError") setState({ kind: "unsupported" });
      else setState({ kind: "error", message: "Couldn’t access your microphone." });
      return;
    }
    streamRef.current = stream;

    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch {
      // No Web Audio: recording still works, just without a level meter.
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    const startedAt = performance.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const durationMs = Math.round(performance.now() - startedAt);
      releaseMic();
      // The recorder may report the exact type it used (e.g. with codecs) — prefer that.
      const type = recorder.mimeType || mimeType;
      const blob = new Blob(chunks, { type });
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setState({ kind: "recorded", recording: { blob, url, mimeType: type, durationMs } });
    };

    // A timeslice makes the browser hand us data every second, so a long recording isn't
    // one giant buffer that's only flushed at the very end.
    recorder.start(1000);
    setState({ kind: "recording", elapsedMs: 0 });

    timerRef.current = setInterval(() => {
      const elapsedMs = performance.now() - startedAt;
      if (elapsedMs >= maxDurationSec * 1000) {
        stop(); // hard limit: protects STT/LLM cost and matches the API's duration check
      } else {
        setState({ kind: "recording", elapsedMs });
      }
    }, 250);
  }, [maxDurationSec, releaseMic, revokePreview, stop]);

  /** Discard the current recording (or error) and go back to the start. */
  const reset = useCallback(() => {
    revokePreview();
    setState({ kind: "idle" });
  }, [revokePreview]);

  // Leaving the page mid-recording must turn the mic off and free memory.
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.onstop = null; // don't set state on an unmounted component
        recorder.stop();
      }
      releaseMic();
      revokePreview();
    },
    [releaseMic, revokePreview],
  );

  /** Current input loudness 0..1 (RMS of the waveform), 0 when not recording. */
  const getLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    // Speech RMS is usually ~0.02–0.2; scale so normal speech fills most of the meter.
    return Math.min(1, Math.sqrt(sum / samples.length) * 6);
  }, []);

  return { state, start, stop, reset, getLevel };
}
