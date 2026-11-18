"use client";

import { ProPrice } from "@/components/pro-price";
import { UpgradeButton } from "@/components/upgrade-button";
import { PRO_FEATURES } from "@/funnel/plans";

const FREE_FEATURES = ["The speaking check", "Lesson 1", "3 speaking analyses a day"];

/** Free vs Pro (SPEC §11 /pricing). The price comes from Paddle; nothing is hard-coded here. */
export function PricingView() {
  return (
    <>
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold">Simple pricing</h1>
        <p className="text-slate-600">Start free. Upgrade when you want every lesson.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-6">
          <div>
            <h2 className="text-lg font-semibold">Free</h2>
            <p className="text-3xl font-semibold">$0</p>
          </div>
          <Features items={FREE_FEATURES} />
        </section>
        <section className="flex flex-col gap-4 rounded-2xl border-2 border-slate-900 p-6">
          <div>
            <h2 className="text-lg font-semibold">Pro</h2>
            <p className="text-3xl font-semibold">
              <ProPrice fallback="…" />
              <span className="text-base font-normal text-slate-500"> / month</span>
            </p>
          </div>
          <Features items={PRO_FEATURES} />
          <div className="mt-auto">
            <UpgradeButton placement="pricing" />
            <p className="mt-2 text-center text-xs text-slate-500">
              Renews monthly. Cancel anytime. Paddle is our reseller and handles taxes.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function Features({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden className="text-emerald-600">
            ✓
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}
