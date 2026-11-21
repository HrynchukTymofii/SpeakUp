import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy — SpeakUp" };

// Written from what the code actually does (SPEC §9, the worker's funnel cleanup, the S3
// lifecycle rule, CloudWatch retention). If data handling changes, change this page with it.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        SpeakUp is run by {LEGAL.operator} (“we”, “us”). This policy explains what we collect when
        you use SpeakUp, why, who helps us process it, and how long we keep it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your email address, and your name and profile picture if
          you sign in with a social account.
        </li>
        <li>
          <strong>Your recordings:</strong> the audio you record in SpeakUp, the transcript we make
          from it, and the feedback and scores we produce.
        </li>
        <li>
          <strong>Your answers in the speaking check:</strong> for example your goal and how
          confident you feel, used to personalize your plan.
        </li>
        <li>
          <strong>Billing status:</strong> whether you have a subscription and its identifiers at
          Paddle. We never see or store your card details.
        </li>
        <li>
          <strong>Technical data:</strong> your IP address, used only in hashed (unreadable) form to
          limit abuse, and server logs that never contain your recordings, transcripts or email.
        </li>
        <li>
          <strong>Usage data:</strong> which pages and steps you open and what you do there (for
          example your answers in the speaking check, recordings submitted, lessons finished,
          checkout opened), linked to a random device id and, once you have an account, your account
          id. It also includes your browser and device type and an approximate location (country and
          city) derived from your IP address. It never contains your email, your recordings or their
          transcripts.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To analyze your speaking and show you feedback — the service you asked for.</li>
        <li>To run your account, your subscription and your lesson progress.</li>
        <li>To keep the service secure and stop automated abuse.</li>
        <li>To understand which parts of SpeakUp help people and where they get stuck.</li>
      </ul>
      <p>We do not sell your data and we do not show ads.</p>

      <h2>Who processes it for us</h2>
      <ul>
        <li>
          <strong>Clerk</strong> — sign-in and account management.
        </li>
        <li>
          <strong>Paddle</strong> — checkout and billing. Paddle is the merchant of record and
          processes your payment details under its own privacy policy.
        </li>
        <li>
          <strong>Deepgram</strong> — turns your recording into a transcript.
        </li>
        <li>
          <strong>Anthropic</strong> — writes feedback on the content of your transcript.
        </li>
        <li>
          <strong>Amazon Web Services</strong> (United States) — hosts our servers, our database and
          your recordings.
        </li>
        <li>
          <strong>Vercel</strong> — hosts this website.
        </li>
        <li>
          <strong>Cloudflare Turnstile</strong> — the bot check in the speaking check.
        </li>
        <li>
          <strong>Amplitude</strong> (United States) — product analytics (the usage data above).
        </li>
      </ul>
      <p>
        These providers process data only to provide their part of the service to us. Some of them
        are outside your country, including in the United States.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          If you record in the speaking check but don’t create an account, your recording and
          answers are deleted automatically after 7 days.
        </li>
        <li>Uploads that are never submitted for analysis are deleted after 1 day.</li>
        <li>
          While you have an account, we keep your recordings and results so you can see your
          progress. When you ask us to delete your account, we delete them.
        </li>
        <li>Server logs are kept for 30 days.</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use cookies to keep you signed in (set by Clerk), to run the bot check and to process
        payments. One analytics cookie (set by Amplitude) holds the random device id for the usage
        data above; it is shared between our website and the web app. We don’t use advertising
        cookies.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask us for a copy of your data, to correct it, or to delete your account and
        everything in it. Email <ContactEmail /> and we’ll reply within 30 days. You can also
        complain to your local data protection authority.
      </p>

      <h2>Children</h2>
      <p>SpeakUp is not meant for children under 16, and we don’t knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we’ll update the date at the top, and tell you by email when the
        change is significant. See also our <Link href="/terms">Terms</Link>.
      </p>
    </LegalPage>
  );
}
