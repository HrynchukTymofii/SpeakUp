"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/icons";
import { Mascot } from "@/components/mascot";
import { track } from "@/funnel/analytics";
import { useInstall } from "@/lib/pwa/install-events";
import type { InstallPlacement } from "@/lib/pwa/install-platform";

/**
 * "Get SpeakUp on your home screen": the install offer, adapted to what this browser can do
 * (see `install-platform.ts`). Renders nothing when SpeakUp already runs as the installed app,
 * and nothing during server render (the platform is only known in the browser).
 */
export function InstallCard({ placement }: { placement: InstallPlacement }) {
  const { platform, promptInstall } = useInstall();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current || platform === null || platform === "standalone") return;
    shownRef.current = true;
    track("install_prompt_shown", { placement, platform });
  }, [placement, platform]);

  if (platform === null || platform === "standalone") return null;

  const install = async () => {
    const outcome = await promptInstall();
    track(outcome === "accepted" ? "install_prompt_accepted" : "install_prompt_dismissed", {
      placement,
    });
  };

  return (
    <section className="card flex flex-col items-center gap-4 p-6 text-center">
      <Mascot mood="happy" size={80} />
      <div>
        <h2 className="text-xl font-bold tracking-[-0.01em]">Get SpeakUp on your home screen</h2>
        <p className="mt-1 text-muted">Open your practice in one tap, like any other app.</p>
      </div>

      {platform === "prompt" && (
        <button type="button" className="btn btn-primary w-full" onClick={install}>
          <Icon name="download" className="size-5" />
          Install the app
        </button>
      )}

      {platform === "ios" && (
        <ol className="flex w-full flex-col gap-2 text-left">
          <li className="flex items-center gap-3 rounded-2xl bg-card-2 px-4 py-3">
            <span className="font-bold">1.</span>
            <span>
              Tap <Icon name="share" className="inline size-5 align-text-bottom" /> <b>Share</b> in
              the browser bar
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-card-2 px-4 py-3">
            <span className="font-bold">2.</span>
            <span>
              Choose <Icon name="plusSquare" className="inline size-5 align-text-bottom" />{" "}
              <b>Add to Home Screen</b>
            </span>
          </li>
        </ol>
      )}

      {platform === "in_app_browser" && (
        <p className="text-muted">
          Open this page in Safari or Chrome to install. Tap the menu (•••) and choose Open in
          browser.
        </p>
      )}

      {platform === "manual" && (
        <p className="text-muted">
          Use your browser&apos;s menu: <b className="text-ink">Install app</b> or{" "}
          <b className="text-ink">Add to Home screen</b>.
        </p>
      )}
    </section>
  );
}
