import { PracticeFeed } from "./practice-feed";

/** Practice tab: swipe through quick drills and record them inline. */
export default function PracticePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-4">
      <PracticeFeed />
    </main>
  );
}
