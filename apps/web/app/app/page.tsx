import { BaselineCard } from "./baseline-card";
import { CourseList } from "./course-list";
import { ProfileCard } from "./profile-card";

// Dashboard: baseline speaking check (M5), course → lessons (M3), profile.
// Attempt history (GET /v1/attempts) comes with the history page.
export default function DashboardPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <BaselineCard />
      <CourseList />
      <ProfileCard />
    </main>
  );
}
