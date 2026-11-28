"use client";

import { BackLink } from "@/components/back-link";
import { useLearnData } from "@/learn/use-learn-data";
import { CoursePath } from "../../course-path";

export function CourseView({ slug }: { slug: string }) {
  const { data, error } = useLearnData();
  const back = <BackLink href="/app">Learn</BackLink>;

  if (error) {
    return (
      <>
        {back}
        <p role="alert" className="font-medium text-danger">
          Couldn’t load the course: {error.message}
        </p>
      </>
    );
  }
  if (!data) return <p className="text-muted">Loading…</p>;

  const course = data.courses.find((c) => c.slug === slug);
  return (
    <>
      {back}
      {course ? (
        <CoursePath course={course} completed={data.completed} />
      ) : (
        <p role="alert" className="font-medium text-danger">
          This course doesn’t exist.
        </p>
      )}
    </>
  );
}
