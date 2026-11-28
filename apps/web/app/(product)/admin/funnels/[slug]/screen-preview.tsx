"use client";

import type { FunnelStepDef } from "@speakup/shared";
import { useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { NO_BACK_STEP_TYPES, PROGRESS_STEP_TYPES } from "@/funnel/config";
import { progressOf } from "@/funnel/engine";
import { FunnelPreviewScope } from "@/funnel/funnel-context";
import { FunnelProgressBar } from "@/funnel/funnel-shell";
import { STEP_COMPONENTS } from "@/funnel/steps";
import type { StepProps } from "@/funnel/steps/props";
import { DEVICES } from "./device-frame";
import { VisitorHeader } from "./visitor-header";

/** The phone the preview draws, in CSS pixels: iPhone 12–16's viewport, the most common size. */
export const PHONE = DEVICES.phone;
/** Bezel around the screen, in the same unscaled pixels. */
const BEZEL = 12;
const FRAME_WIDTH = PHONE.width + 2 * BEZEL;
const FRAME_HEIGHT = PHONE.height + 2 * BEZEL;

const noop = () => {};

/**
 * One screen of the funnel as visitors see it on a phone: the real page laid out at a real phone
 * viewport (header, progress bar, the funnel's own column), then scaled down as a whole to fit
 * the panel, so proportions and line breaks match the phone. The screen scrolls like the phone.
 *
 * Steps run in preview mode (FunnelPreviewScope): sample data, no API calls for the visitor's
 * session, no analytics, no store writes. `inert`: nothing can be tapped or focused.
 */
export function ScreenPreview({
  slug,
  steps,
  step,
}: {
  slug: string;
  steps: FunnelStepDef[];
  step: FunnelStepDef;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const fit = () => setScale(Math.min(1, el.clientWidth / FRAME_WIDTH));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const index = steps.findIndex((s) => s.id === step.id);
  const showProgress = PROGRESS_STEP_TYPES.has(step.type);
  const canGoBack = index > 0 && !NO_BACK_STEP_TYPES.has(step.type) && step.type !== "paywall";

  return (
    <div ref={box} className="w-full">
      <div
        className="mx-auto"
        style={{ width: FRAME_WIDTH * scale, height: FRAME_HEIGHT * scale }}
        data-testid="phone"
      >
        <div
          className="rounded-[52px] bg-ink shadow-soft"
          style={{
            width: FRAME_WIDTH,
            height: FRAME_HEIGHT,
            padding: BEZEL,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div
            // Scrollable by mouse or touch, never a keyboard stop: the screen inside is inert.
            tabIndex={-1}
            // translateZ: `position: fixed` inside a step (the loader's question sheet) is placed
            // against this screen, not the editor page. The screen itself isn't inert, so the
            // admin can still scroll a long screen (paywall, results); no scrollbar, like a phone.
            className="flex h-full w-full flex-col overflow-x-hidden overflow-y-auto rounded-[40px] bg-page text-ink [scrollbar-width:none] [transform:translateZ(0)]"
          >
            <div inert className="flex min-h-full flex-col" data-testid="live-preview">
              <VisitorHeader />
              <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-5">
                <FunnelPreviewScope slug={slug} steps={steps}>
                  <div key={step.id} className="flex flex-1 flex-col gap-5">
                    {showProgress && (
                      <FunnelProgressBar
                        value={progressOf(steps, step)}
                        canGoBack={canGoBack}
                        onBack={noop}
                      />
                    )}
                    <div className="flex flex-1 flex-col">
                      <LiveScreen step={step} />
                    </div>
                  </div>
                </FunnelPreviewScope>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveScreen({ step }: { step: FunnelStepDef }) {
  // Same widening as FunnelShell's StepView: the map pairs each type with its component.
  const Component = STEP_COMPONENTS[step.type] as ComponentType<StepProps<typeof step.type>>;
  return <Component step={step as never} ctx={{ answers: {}, topIssues: [] }} onNext={noop} />;
}
