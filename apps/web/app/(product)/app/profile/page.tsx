import { ProfileView } from "./profile-view";

/** Profile tab: progress, skills over time, goal, recent recordings, plan. */
export default function ProfilePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-6">
      <ProfileView />
    </main>
  );
}
