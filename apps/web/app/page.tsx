import Link from "next/link";
import { Mascot, type MascotMood } from "@/components/mascot";

// The three steps restate the value proposition below — no new claims or numbers.
const STEPS: { title: string; body: string; color: string; mood: MascotMood }[] = [
  {
    title: "Record yourself",
    body: "Speak for 45 seconds, right in your browser.",
    color: "bg-lav",
    mood: "listening",
  },
  {
    title: "Get clear feedback",
    body: "Your pace, pauses, filler words and clarity.",
    color: "bg-butter",
    mood: "thinking",
  },
  {
    title: "Practice daily",
    body: "Short lessons that build on your results.",
    color: "bg-sage",
    mood: "happy",
  },
];

// Landing (SPEC §11): value proposition + CTA into the funnel.
// TODO(founder): real copy, visuals and any social proof — no invented numbers.
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-16 px-4 pt-10 pb-20 sm:pt-20">
      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="font-display text-[44px] leading-[1.02] font-semibold tracking-tight text-balance sm:text-7xl">
          Speak with{" "}
          <span
            aria-hidden
            className="mx-0.5 inline-flex h-[0.9em] w-[1.5em] translate-y-[0.08em] items-center justify-center rounded-[0.32em] bg-peach align-baseline"
          >
            <Mascot size={40} mood="happy" className="h-[0.8em] w-[0.8em]" />
          </span>{" "}
          confidence
          <span className="mt-3 block text-[0.5em] leading-tight font-medium text-muted">
            — in interviews, meetings and on stage.
          </span>
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-muted">
          Record yourself for 45 seconds and get clear feedback on your pace, pauses, filler words
          and clarity. Then practice with short daily lessons.
        </p>
        <div className="flex w-full flex-col items-center gap-3 sm:w-auto">
          <Link
            href="/start"
            className="btn btn-primary min-h-14 w-full px-5 sm:w-auto sm:px-8 sm:text-[17px]"
          >
            Take the 2-minute speaking check
          </Link>
          <Link href="/app" className="link py-2 text-sm font-semibold">
            Already have an account? Go to your dashboard
          </Link>
        </div>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-5">
        <h2 id="how" className="eyebrow text-center">
          How it works
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className={`flex items-center gap-4 rounded-[28px] p-5 text-on-pastel shadow-soft sm:flex-col sm:items-start ${s.color}`}
            >
              <Mascot mood={s.mood} size={64} className="sm:-ml-1" />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-extrabold tracking-[0.12em] text-on-pastel-muted uppercase">
                  Step {i + 1}
                </span>
                <h3 className="font-display text-xl leading-tight font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-on-pastel-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
