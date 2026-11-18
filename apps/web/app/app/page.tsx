import { Mascot } from "@/components/mascot";
import { BaselineCard } from "./baseline-card";
import { CourseList } from "./course-list";
import { ProfileCard } from "./profile-card";

// Dashboard: baseline speaking check (M5), course → lessons (M3), profile.
// Attempt history (GET /v1/attempts) comes with the history page.
export default function DashboardPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-8 pb-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-[40px] leading-none font-semibold tracking-tight">
          Dashboard
        </h1>
        <Mascot size={64} />
      </div>
      <BaselineCard />
      <CourseList />
      <ProfileCard />
    </main>
  );
}
