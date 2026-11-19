import { ChallengesView } from "./challenges-view";

/** Challenges tab: the 7-day story challenge, "speak like a legend", contests (coming soon). */
export default function ChallengesPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-6">
      <ChallengesView />
    </main>
  );
}
