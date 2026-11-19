import { ModeGrid } from "./mode-grid";

/** Practice tab: pick a mode, get a random topic, speak. */
export default function PracticePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-6">
      <h1 className="font-display text-[34px] leading-none font-semibold tracking-tight">
        Practice
      </h1>
      <ModeGrid />
    </main>
  );
}
