"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The funnel's mini-lesson video. It starts on its own when the step opens.
 *
 * Browsers only allow autoplay *with sound* after a recent tap on the page. That is normally true
 * here (the visitor just tapped "Continue"), but not after a reload, and iOS is stricter. If sound
 * is refused, the video plays muted and a "Tap for sound" button appears. In Low Power Mode, iOS
 * also blocks muted autoplay; the same button then starts the video.
 */
export function LessonVideo({ src, onEnded }: { src: string; onEnded: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let cancelled = false;
    video.muted = false;
    Promise.resolve(video.play())
      .catch(() => {
        if (cancelled) return;
        video.muted = true;
        setNeedsTap(true);
        return video.play();
      })
      .catch(() => {}); // muted playback blocked too: the button / native controls start it
    return () => {
      cancelled = true;
    };
  }, [src]);

  const playWithSound = () => {
    const video = ref.current;
    if (!video) return;
    video.muted = false;
    void Promise.resolve(video.play()).catch(() => {});
    setNeedsTap(false);
  };

  return (
    <div className="relative">
      <video
        ref={ref}
        src={src}
        controls
        playsInline
        preload="auto"
        onEnded={onEnded}
        // Unmuting through the native controls also hides our button.
        onVolumeChange={(e) => {
          if (!e.currentTarget.muted) setNeedsTap(false);
        }}
        className="aspect-square w-full rounded-3xl bg-black shadow-soft"
      />
      {needsTap && (
        <button
          type="button"
          onClick={playWithSound}
          // Bottom corner: the video's captions are burned in at the top.
          className="btn btn-primary btn-sm absolute right-3 bottom-14 shadow-soft"
        >
          <span aria-hidden>🔊</span> Tap for sound
        </button>
      )}
    </div>
  );
}
