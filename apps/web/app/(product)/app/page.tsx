import { LearnView } from "./learn-view";

/** The Learn tab: stats, lessons picked for the user, and the course path. */
export default function LearnPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-6">
      <LearnView />
    </main>
  );
}
