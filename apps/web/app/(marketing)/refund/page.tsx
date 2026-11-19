import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Refund policy — SpeakUp" };

export default function RefundPage() {
  const days = LEGAL.refundWindowDays;
  return (
    <LegalPage title="Refund policy">
      <p>
        SpeakUp Pro is sold through <strong>Paddle.com</strong>, our merchant of record, so refunds
        are paid out by Paddle to your original payment method.
      </p>

      <h2>Asking for a refund</h2>
      <p>
        You can ask for a full refund within {days} days of any payment, for any reason. Email{" "}
        <ContactEmail /> from your account’s email address, or reply to your Paddle receipt. Refunds
        usually reach you within 5–10 business days, depending on your bank.
      </p>
      <p>When a payment is refunded, your Pro access for that period ends.</p>

      <h2>Cancelling</h2>
      <p>
        You can cancel anytime from Billing in your account. Cancelling stops future renewals; you
        keep Pro until the end of the period you already paid for. After {days} days, payments for
        the current period are not refunded.
      </p>

      <h2>Your legal rights</h2>
      <p>
        This policy doesn’t limit any rights you have under consumer protection law where you live.
        See also our <Link href="/terms">Terms</Link>.
      </p>
    </LegalPage>
  );
}
