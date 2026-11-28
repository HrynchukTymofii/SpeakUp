/**
 * Line icons for courses, practice modes and small UI moments. The app uses these instead of
 * emoji (owner's call: emoji look cheap next to the Glow design). One stroke style, drawn on a
 * 24-unit grid like the tab bar icons; colour comes from `currentColor`.
 * To swap a course or mode picture for an image later, change it here or in `IconTile`.
 */
const PATHS = {
  mic: "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-6.5 8a6.5 6.5 0 0 0 13 0M12 17.5V21",
  chat: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5Z",
  rocket:
    "M14 4c3-1 5.5-.5 6 0 .5.5 1 3 0 6l-6 6-6-6 6-6Zm-6 6-3 .5L3 13l4 1m6 3 .5 3 2.5-2-1-4M15.5 8.5h0",
  presentation:
    "M3 4h18M5 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4m-7 11v3m-4 3 4-3 4 3M9 11l2-2 2 2 3-3",
  briefcase:
    "M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5ZM9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M4 12.5h16",
  clipboard:
    "M8 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H16M9 3.5h6V6.5H9ZM9 11h6m-6 4h4",
  breath: "M4 9h10a3 3 0 1 0-3-3M4 15h13a3 3 0 1 1-3 3M4 12h7",
  book: "M4 19V6a2 2 0 0 1 2-2h12v13H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h12",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12v4l2.5 2M10 2.5h4",
  question:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.4-11.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.5M12 17h0",
  flame:
    "M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 3-5.6 3.9-9.3 2.3 1.4 3.6 3.6 3.9 5.6 1-.6 1.7-1.7 1.9-3 1.9 1.6 3.3 4 3.3 6.7 0 3.6-2.6 6.2-6.5 6.2Z",
  waves: "M3 12h2l2-5 3 10 3-12 3 9 1.5-2H21",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6Z",
  lock: "M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5Zm2-.5V8a3.5 3.5 0 0 1 7 0v2",
  share:
    "M12 14.5V3.5M8.5 7 12 3.5 15.5 7M8.5 10H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1.5",
  plusSquare:
    "M6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4ZM12 8.5v7M8.5 12h7",
  download: "M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14",
  speaker: "M4 9.5h3.5L12 5.5v13l-4.5-4H4ZM15.5 9a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11",
  play: "M8 5.5v13l10.5-6.5Z",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`shrink-0 fill-none stroke-current stroke-[1.8] ${className}`}
    >
      <path d={PATHS[name]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
