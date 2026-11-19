/** A pastel square on graph paper with an emoji: the icon of a course, mode or lesson. */
export function IconTile({ icon, surface }: { icon: string; surface: string }) {
  return (
    <span
      aria-hidden
      className={`paper flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${surface}`}
    >
      {icon}
    </span>
  );
}

/** The black play button inside the white "continue" pills. */
export function PlayCircle() {
  return (
    <span
      aria-hidden
      className="flex size-11 items-center justify-center rounded-full bg-on-pastel text-white"
    >
      <svg viewBox="0 0 16 16" className="ml-0.5 size-4 fill-current">
        <path d="M4 2.5v11l9-5.5-9-5.5Z" />
      </svg>
    </span>
  );
}
