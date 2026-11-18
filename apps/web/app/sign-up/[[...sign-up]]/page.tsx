import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <main className="flex min-h-[calc(100dvh-57px)] flex-col items-center justify-start px-4 py-10 sm:justify-center">
      <Suspense>
        <SignUp />
      </Suspense>
    </main>
  );
}
