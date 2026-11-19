import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

// Optional catch-all route: Clerk's <SignIn> uses sub-paths (e.g. /sign-in/factor-one).
export default function SignInPage() {
  return (
    <main className="flex min-h-[calc(100dvh-57px)] flex-col items-center justify-start px-4 py-10 sm:justify-center">
      <Suspense>
        <SignIn />
      </Suspense>
    </main>
  );
}
