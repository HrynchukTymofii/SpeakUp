import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of service — SpeakUp" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms are an agreement between you and {LEGAL.operator} (“we”, “us”) about your use of
        SpeakUp. By creating an account or using SpeakUp you accept them.
      </p>

      <h2>The service</h2>
      <p>
        SpeakUp lets you record yourself speaking and gives you automated feedback (pace, pauses,
        filler words, clarity and more) and practice lessons. The feedback is produced by software
        and can be wrong. It is practice material, not professional, medical or speech-therapy
        advice.
      </p>

      <h2>Your account</h2>
      <p>
        You must be at least 16 and give a valid email address. Keep your sign-in secure — you are
        responsible for what happens in your account.
      </p>

      <h2>Your recordings</h2>
      <p>
        Your recordings stay yours. You allow us to store and process them only to provide SpeakUp
        to you, as described in our <Link href="/privacy">Privacy policy</Link>. Only record your
        own voice, or other people with their permission.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don’t try to break, overload or get around the limits of the service.</li>
        <li>Don’t use automated tools to create accounts or submit recordings.</li>
        <li>Don’t upload content that is illegal or that you have no right to use.</li>
      </ul>

      <h2>Plans and payment</h2>
      <p>
        SpeakUp has a free plan and a paid Pro subscription. Our order process is conducted by our
        online reseller <strong>Paddle.com</strong>, the merchant of record for all our orders.
        Paddle handles payments, taxes and invoices, and its buyer terms apply to your purchase.
      </p>
      <ul>
        <li>Pro renews automatically each billing period until you cancel.</li>
        <li>
          You can cancel anytime from Billing in your account. You keep Pro until the end of the
          period you paid for.
        </li>
        <li>
          Refunds are covered by our <Link href="/refund">Refund policy</Link>.
        </li>
        <li>
          If we change the price, we’ll tell you before your next renewal, and you can cancel before
          it applies.
        </li>
      </ul>

      <h2>Availability and changes</h2>
      <p>
        We work to keep SpeakUp running but can’t promise it will always be available or free of
        errors. We may change or remove features. We’ll tell you in advance about changes that
        significantly affect a paid plan.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can stop using SpeakUp and ask us to delete your account at any time. We may suspend
        accounts that break these terms.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, SpeakUp is provided “as is”, and our total liability to you is
        limited to the amount you paid us in the 12 months before the claim. Nothing in these terms
        limits rights you have under consumer protection law.
      </p>

      <h2>Law and contact</h2>
      <p>
        These terms are governed by the laws of {LEGAL.governingLaw}. Questions? Email{" "}
        <ContactEmail />.
      </p>
    </LegalPage>
  );
}
