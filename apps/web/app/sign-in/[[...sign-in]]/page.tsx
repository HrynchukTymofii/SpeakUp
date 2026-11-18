import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

// Optional catch-all route: Clerk's <SignIn> uses sub-paths (e.g. /sign-in/factor-one).
export default function SignInPage() {
  return (
    <main className="flex justify-center px-4 py-12">
      <Suspense>
        <SignIn />
      </Suspense>
    </main>
  );
}
