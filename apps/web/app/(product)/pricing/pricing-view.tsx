"use client";

import { ProPrice } from "@/components/pro-price";
import { Mascot } from "@/components/mascot";
import { UpgradeButton } from "@/components/upgrade-button";
import { PRO_FEATURES } from "@/funnel/plans";
import { CheckoutTerms } from "@/components/checkout-terms";
import { Icon } from "@/components/icons";

const FREE_FEATURES = ["The speaking check", "Lesson 1", "3 speaking analyses a day"];

/** Free vs Pro (SPEC §11 /pricing). The price comes from Paddle; nothing is hard-coded here. */
export function PricingView() {
  return (
    <>
      <header className="flex flex-col items-center gap-3 text-center">
        <Mascot mood="happy" size={88} />
        <h1 className="font-display text-[44px] leading-none font-semibold tracking-tight sm:text-6xl">
          Simple pricing
        </h1>
        <p className="text-lg text-muted">Start free. Upgrade when you want every lesson.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="flex flex-col gap-5 rounded-[28px] border border-line bg-card p-6 shadow-soft">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-semibold">Free</h2>
            <p className="font-display text-5xl font-semibold">$0</p>
          </div>
          <Features items={FREE_FEATURES} />
        </section>
        <section className="flex flex-col gap-5 rounded-[28px] bg-ink p-6 text-page shadow-soft">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-semibold">Pro</h2>
            <p className="font-display text-5xl font-semibold">
              <ProPrice fallback="…" />
              <span className="font-sans text-base font-medium text-page/60"> / month</span>
            </p>
          </div>
          <Features items={PRO_FEATURES} />
          <div className="mt-auto">
            <UpgradeButton placement="pricing" />
            <p className="mt-3 text-center text-xs text-page/60">
              Renews monthly. Cancel anytime. Paddle is our reseller and handles taxes.
            </p>
            <CheckoutTerms className="mt-1 text-page/60" />
          </div>
        </section>
      </div>
    </>
  );
}

function Features({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-3 text-[15px] font-medium">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sage text-on-pastel"
          >
            <Icon name="check" className="size-3.5" strokeWidth={2.5} />
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}
