import type { Metadata } from "next";
import { PricingView } from "./pricing-view";

export const metadata: Metadata = { title: "Pricing — SpeakUp" };

export default function PricingPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <PricingView />
    </main>
  );
}
