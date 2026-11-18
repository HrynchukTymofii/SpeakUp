import { useId } from "react";

export type MascotMood = "idle" | "listening" | "happy" | "thinking";

/**
 * SpeakUp's mascot: a little speech-bubble buddy. Flat shapes + a soft radial gradient + an
 * expressive face; the mood changes the face and adds a prop (sound waves, sparkles, "…").
 * Colors come from the theme tokens (CSS variables), so it follows globals.css.
 * Animations live in globals.css (`.mascot*`) and switch off for reduced motion.
 */
export function Mascot({
  mood = "idle",
  size = 96,
  className = "",
  label,
}: {
  mood?: MascotMood;
  size?: number;
  className?: string;
  /** Accessible name; without it the mascot is decorative (hidden from screen readers). */
  label?: string;
}) {
  // Gradient ids must be unique per instance (several mascots can share a page).
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const body = `mascot-body-${uid}`;
  const glow = `mascot-glow-${uid}`;
  const shine = `mascot-shine-${uid}`;

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={`mascot mascot-${mood} shrink-0 overflow-visible ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <radialGradient id={body} cx="36%" cy="28%" r="80%">
          <stop offset="0" style={{ stopColor: "color-mix(in srgb, var(--peach) 45%, white)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--peach)" }} />
          <stop
            offset="1"
            style={{ stopColor: "color-mix(in srgb, var(--peach-2) 80%, var(--orange))" }}
          />
        </radialGradient>
        <radialGradient id={glow}>
          <stop offset="0" style={{ stopColor: "var(--peach)", stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: "var(--peach)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "white", stopOpacity: 0.7 }} />
          <stop offset="1" style={{ stopColor: "white", stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      <circle className="mascot-glow" cx="60" cy="58" r="58" fill={`url(#${glow})`} />

      <g className="mascot-bob">
        {/* body: a round speech bubble with a tail at the bottom left */}
        <path
          d="M60 16C84.3 16 103 32.6 103 55S84.3 94 60 94c-5.6 0-11-.9-15.9-2.6L29.6 101.7c-2.3 1.6-5.2-.8-4.1-3.4l5.6-13.1C22.6 77.8 17 67 17 55 17 32.6 35.7 16 60 16Z"
          fill={`url(#${body})`}
        />
        {/* soft inner shade at the bottom + a highlight at the top left */}
        <path
          d="M23 66c5 15 19.5 25 37 25 17 0 31.3-9.4 36.6-24C90 79 76 86 60 86S29 79 23 66Z"
          fill="black"
          opacity="0.07"
        />
        <ellipse
          cx="44"
          cy="31"
          rx="15"
          ry="7"
          fill={`url(#${shine})`}
          transform="rotate(-18 44 31)"
        />

        {/* cheeks */}
        <ellipse cx="38.5" cy="64" rx="6" ry="3.6" fill="var(--rose)" opacity="0.9" />
        <ellipse cx="81.5" cy="64" rx="6" ry="3.6" fill="var(--rose)" opacity="0.9" />

        <Face mood={mood} />
      </g>

      <Extras mood={mood} />
    </svg>
  );
}

const INK = "var(--on-pastel)";

function Face({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case "listening":
      return (
        <g>
          <g className="mascot-eyes">
            <circle cx="47" cy="51" r="5" fill={INK} />
            <circle cx="73" cy="51" r="5" fill={INK} />
            <circle cx="48.8" cy="49.2" r="1.6" fill="white" />
            <circle cx="74.8" cy="49.2" r="1.6" fill="white" />
          </g>
          <ellipse className="mascot-mouth-talk" cx="60" cy="66" rx="4" ry="4.6" fill={INK} />
        </g>
      );
    case "happy":
      return (
        <g>
          <path
            d="M41 53c1.8-4.6 8.2-4.6 10 0M69 53c1.8-4.6 8.2-4.6 10 0"
            fill="none"
            stroke={INK}
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          <path d="M50 61.5h20c0 6.4-4.5 11-10 11s-10-4.6-10-11Z" fill={INK} />
          <path
            d="M54.5 69.8c1.4-2.2 3.4-3.2 5.5-3.2s4.1 1 5.5 3.2c-1.6 1.2-3.5 1.8-5.5 1.8s-3.9-.6-5.5-1.8Z"
            fill="var(--rose)"
          />
        </g>
      );
    case "thinking":
      return (
        <g>
          <g className="mascot-glance">
            <circle cx="49" cy="49" r="4.4" fill={INK} />
            <circle cx="75" cy="49" r="4.4" fill={INK} />
          </g>
          {/* one raised brow + a lopsided mouth: "hmm" */}
          <path
            d="M70 40.5c2.6-3 7-3 9.5-.5"
            fill="none"
            stroke={INK}
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.75"
          />
          <path
            d="M54.5 67.5c1.8-1.4 3.7-1.4 5.5 0s3.7 1.4 5.5 0"
            fill="none"
            stroke={INK}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        </g>
      );
    default:
      return (
        <g>
          {/* arch eyes (like the reference blob) that blink */}
          <g className="mascot-blink">
            <path
              d="M42 53c1.4-5.2 8.6-5.2 10 0M68 53c1.4-5.2 8.6-5.2 10 0"
              fill="none"
              stroke={INK}
              strokeWidth="3.6"
              strokeLinecap="round"
            />
          </g>
          <path
            d="M54 63.5c3.3 3.8 8.7 3.8 12 0"
            fill="none"
            stroke={INK}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        </g>
      );
  }
}

function Extras({ mood }: { mood: MascotMood }) {
  if (mood === "listening") {
    // sound waves coming out of the bubble
    return (
      <g fill="none" stroke="var(--butter)" strokeWidth="3.4" strokeLinecap="round">
        <path className="mascot-wave" d="M108 46c3.4 5.4 3.4 12.6 0 18" />
        <path className="mascot-wave mascot-wave-2" d="M115 40c5.6 9 5.6 21 0 30" opacity="0.7" />
      </g>
    );
  }
  if (mood === "happy") {
    return (
      <g fill="var(--butter)">
        <path
          className="mascot-sparkle"
          d="M104 18l2.2 5.8 5.8 2.2-5.8 2.2-2.2 5.8-2.2-5.8-5.8-2.2 5.8-2.2Z"
        />
        <path
          className="mascot-sparkle mascot-sparkle-2"
          d="M15 22l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z"
          fill="var(--sky)"
        />
        <circle
          className="mascot-sparkle mascot-sparkle-3"
          cx="110"
          cy="44"
          r="2.4"
          fill="var(--lav)"
        />
      </g>
    );
  }
  if (mood === "thinking") {
    // a tiny "…" thought bubble, top right
    return (
      <g>
        <rect
          x="88"
          y="0"
          width="31"
          height="17"
          rx="8.5"
          fill="var(--card-2)"
          stroke="var(--line-2)"
        />
        <circle className="mascot-dot" cx="96.5" cy="8.5" r="2.3" fill="var(--ink)" />
        <circle className="mascot-dot mascot-dot-2" cx="103.5" cy="8.5" r="2.3" fill="var(--ink)" />
        <circle className="mascot-dot mascot-dot-3" cx="110.5" cy="8.5" r="2.3" fill="var(--ink)" />
      </g>
    );
  }
  return null;
}
