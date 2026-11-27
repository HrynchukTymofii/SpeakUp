import { WarmUpView } from "./warm-up-view";

/** Pre-pitch warm-up: one minute of box breathing, free and recorded nowhere. */
export default function WarmUpPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-8 pb-16">
      <WarmUpView />
    </main>
  );
}
