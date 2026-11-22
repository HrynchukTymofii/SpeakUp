import { Mascot } from "@/components/mascot";

/**
 * Decorative pieces of the landing page ("Glow" look). Everything here is aria-hidden: the page
 * text already says what the pictures show. Colors come from the theme tokens.
 */

const icon =
  "size-5 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]";

export function ArrowIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={icon}>
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

const FEEDBACK_PATHS = {
  pace: (
    <>
      <path d="M4.5 16a8 8 0 1 1 15 0" />
      <path d="m12 13 3.5-4" />
    </>
  ),
  pause: <path d="M9 6v12M15 6v12" />,
  filler: <path d="M5 5h14v10H10l-4 4v-4H5z" />,
  clarity: (
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  ),
};

export function FeedbackIcon({ name }: { name: keyof typeof FEEDBACK_PATHS }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={icon}>
      {FEEDBACK_PATHS[name]}
    </svg>
  );
}

/** A phone showing an example results screen, with two cards floating around it. */
export function HeroPhone() {
  return (
    <div
      aria-hidden
      className="relative mx-auto h-[560px] w-full max-w-[420px] lg:h-[640px] lg:max-w-none"
    >
      <div className="absolute top-0 left-1/2 h-[550px] w-[270px] -translate-x-1/2 -rotate-3 overflow-hidden rounded-[46px] border-8 border-ink bg-page shadow-[0_50px_80px_-40px_rgba(30,20,80,0.55)] lg:h-[630px] lg:w-[310px]">
        <div className="absolute inset-0 bg-[radial-gradient(80%_34%_at_50%_20%,var(--glow),transparent_70%)]" />
        <div className="relative flex flex-col gap-3.5 px-4 pt-11">
          <p className="text-center text-[13.5px] leading-tight font-bold">
            Feedback
            <span className="block text-[11.5px] font-medium text-muted">
              Speaking check · example
            </span>
          </p>
          <p className="mt-2 text-center text-[88px] leading-[0.9] font-light tracking-[-0.06em] lg:text-[104px]">
            72<span className="text-[22px] tracking-normal text-muted">/100</span>
          </p>
          <span className="mx-auto rounded-full bg-brand px-3.5 py-1.5 text-[13.5px] font-bold text-white shadow-peach">
            Clear, a little fast
          </span>
          <dl className="surface rounded-3xl px-3.5 py-0.5 shadow-soft">
            {[
              ["Pace", "168", "wpm", true],
              ["Filler words", "6", "“um” ×4", true],
              ["Long pauses", "2", "fine", false],
              ["Clarity", "Good", "", false],
            ].map(([label, value, unit, flag]) => (
              <div
                key={label as string}
                className="flex items-center justify-between border-line py-2.5 text-[13.5px] font-semibold not-first:border-t"
              >
                <dt className="flex items-center gap-2">
                  {flag ? <span className="size-1.5 rounded-full bg-brand" /> : null}
                  {label}
                </dt>
                <dd className="font-bold">
                  {value}
                  {unit ? <small className="ml-1 font-medium text-muted">{unit}</small> : null}
                </dd>
              </div>
            ))}
          </dl>
          <span className="btn btn-ink mt-1 min-h-12 text-[14.5px]">Fix it with a lesson</span>
        </div>
      </div>
      <div className="surface absolute bottom-6 left-0 hidden w-[220px] items-center gap-3 rounded-[22px] p-3.5 shadow-soft sm:flex">
        <Mascot size={42} />
        <p className="text-sm leading-tight font-bold">
          Today’s minute
          <span className="mt-0.5 block text-xs font-medium text-muted">
            One topic, instant feedback
          </span>
        </p>
      </div>
      <div className="surface-ink absolute top-6 right-0 flex h-[92px] w-[140px] flex-col justify-between rounded-3xl p-3.5 lg:top-9 lg:h-[120px] lg:w-[170px] lg:p-4">
        <b className="text-[28px] leading-none font-semibold tracking-tight lg:text-[34px]">2/3</b>
        <span className="text-xs font-medium text-white/75">Recordings today</span>
      </div>
    </div>
  );
}

const WAVE = [18, 34, 50, 26, 56, 38, 12, 44, 30, 52, 22, 40, 16];

/** The small picture at the top of each "How it works" card. */
export function StepVisual({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div aria-hidden className="flex h-16 items-center gap-1">
        {WAVE.map((h, i) => (
          <i
            key={i}
            style={{ height: h }}
            className={`w-[5px] rounded-full ${i === 6 ? "bg-brand" : "bg-brand/40"}`}
          />
        ))}
      </div>
    );
  }
  if (step === 1) {
    return (
      <div aria-hidden className="flex h-16 items-center gap-3">
        <span className="text-[64px] leading-none font-light tracking-[-0.05em]">72</span>
        <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white shadow-peach">
          a little fast
        </span>
      </div>
    );
  }
  return (
    <div aria-hidden className="flex h-16 w-full items-center gap-1.5">
      {[1, 1, 1, 0, 0].map((done, i) => (
        <i key={i} className={`h-[7px] flex-1 rounded-full ${done ? "bg-ink" : "bg-line-2"}`} />
      ))}
    </div>
  );
}

/** The "video" area of a lesson card: a soft lavender gradient with a simple drawing. */
export function LessonArt({ kind }: { kind: "pause" | "pace" | "breath" }) {
  return (
    <div
      aria-hidden
      className="relative h-48 bg-[linear-gradient(180deg,var(--peach-2),var(--lav))]"
    >
      <svg
        viewBox="0 0 360 192"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        {kind === "pause" ? (
          <g fill="none" stroke="var(--brand)" strokeWidth="4" strokeLinecap="round">
            <path d="M70 80v32M88 64v64M106 74v44M124 58v76M142 82v28" />
            <path d="M218 82v28M236 58v76M254 74v44M272 64v64M290 80v32" opacity=".5" />
            <path d="M162 150h36M162 144v12M198 144v12" stroke="var(--ink)" strokeWidth="3" />
          </g>
        ) : kind === "pace" ? (
          <path
            d="M40 120 C80 60 110 60 140 110 S200 160 230 100 S290 70 320 95"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        ) : (
          <g>
            <rect
              x="125"
              y="40"
              width="110"
              height="110"
              rx="28"
              fill="none"
              stroke="var(--card)"
              strokeWidth="5"
            />
            <circle cx="180" cy="95" r="30" fill="var(--card)" />
            <circle cx="208" cy="40" r="8" fill="var(--ink)" />
          </g>
        )}
      </svg>
    </div>
  );
}
