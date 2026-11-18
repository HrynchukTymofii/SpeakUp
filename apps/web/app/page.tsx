import Link from "next/link";

// Landing (SPEC §11): value proposition + CTA into the funnel.
// TODO(founder): real copy, visuals and any social proof — no invented numbers.
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-16">
      <h1 className="text-4xl leading-tight font-semibold text-balance">
        Speak with confidence — in interviews, meetings and on stage.
      </h1>
      <p className="text-lg text-slate-600">
        Record yourself for 45 seconds and get clear feedback on your pace, pauses, filler words and
        clarity. Then practice with short daily lessons.
      </p>
      <Link
        href="/start"
        className="w-full rounded-xl bg-slate-900 px-5 py-4 text-center text-lg font-semibold text-white hover:bg-slate-700 sm:w-fit"
      >
        Take the 2-minute speaking check
      </Link>
      <Link href="/app" className="text-sm text-slate-600 underline-offset-4 hover:underline">
        Already have an account? Go to your dashboard
      </Link>
    </main>
  );
}
