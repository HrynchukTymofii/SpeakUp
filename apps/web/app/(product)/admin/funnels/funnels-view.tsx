"use client";

import {
  DEFAULT_FUNNEL_SLUG,
  FunnelSlugSchema,
  type AdminFunnel,
  type DuplicateFunnelBody,
  type FunnelStatus,
} from "@speakup/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { BackLink } from "@/components/back-link";
import { Icon } from "@/components/icons";
import { Mascot } from "@/components/mascot";
import { ApiClientError } from "@/lib/api";
import { useApi } from "@/lib/use-api";

const QUERY_KEY = ["admin-funnels"];

/** `btn-sm` is 40 px tall; admin actions keep the 44 px tap target (design-system.md). */
const SMALL_BUTTON = "btn btn-sm min-h-11";

/** The API's own message for refusals (409 slug taken, main can't go offline…), else a generic one. */
function errorText(error: unknown): string {
  if (error instanceof ApiClientError && error.status < 500) return error.message;
  return "Something went wrong. Please try again.";
}

/**
 * Funnel admin (funnel builder part 3): every funnel with its status and 30-day numbers, a
 * live/draft switch, "New funnel" and "Duplicate" to start a funnel for an ad, and links to its
 * editor and a test run.
 */
export function FunnelsView() {
  const api = useApi();
  const funnels = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.getAdminFunnels(),
    // A 403 (not an admin) won't change by retrying: show the right screen at once.
    retry: (count, err) => !(err instanceof ApiClientError && err.status < 500) && count < 1,
  });

  if (funnels.isPending) return <p className="text-muted">Loading…</p>;

  if (funnels.isError) {
    if (funnels.error instanceof ApiClientError && funnels.error.status === 403) {
      return (
        <div className="flex flex-col items-center gap-5 pt-10 text-center">
          <Mascot mood="thinking" size={96} />
          <div>
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">
              This page is for admins
            </h1>
            <p className="mt-2 text-muted">Your account doesn’t have access to the funnels.</p>
          </div>
          <BackLink href="/app">Back to the app</BackLink>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="font-medium text-danger">
          Couldn’t load the funnels.
        </p>
        <button
          type="button"
          className={`${SMALL_BUTTON} btn-secondary w-fit`}
          onClick={() => void funnels.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <BackLink href="/app">Back to the app</BackLink>
      <div>
        <h1 className="font-display text-[40px] leading-none font-semibold tracking-tight">
          Funnels
        </h1>
        <p className="mt-2 text-muted">
          Each funnel has its own link for an ad or audience. Drafts aren’t visible to visitors.
          Numbers cover the last 30 days. Open “Edit screens” to change a funnel’s screens.
        </p>
      </div>
      <NewFunnel />
      <ul className="flex flex-col gap-4">
        {funnels.data.funnels.map((funnel) => (
          <li key={funnel.slug}>
            <FunnelCard funnel={funnel} />
          </li>
        ))}
      </ul>
    </>
  );
}

function FunnelCard({ funnel }: { funnel: AdminFunnel }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [duplicating, setDuplicating] = useState(false);
  const duplicateButton = useRef<HTMLButtonElement>(null);
  // Closing the form would otherwise drop keyboard focus to <body>: hand it back to "Duplicate".
  const closeForm = () => {
    setDuplicating(false);
    duplicateButton.current?.focus();
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const setStatus = useMutation({
    mutationFn: (status: FunnelStatus) => api.setFunnelStatus(funnel.slug, status),
    onSuccess: refresh,
  });

  const isLive = funnel.status === "live";
  const isDefault = funnel.slug === DEFAULT_FUNNEL_SLUG;
  const { started, signedUp } = funnel.sessions30d;
  const signUpRate = started > 0 ? Math.round((signedUp / started) * 100) : 0;
  const updated = new Date(funnel.updatedAt).toLocaleDateString();

  return (
    <article className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-[-0.01em] break-words">{funnel.name}</h2>
          <p className="text-sm text-muted">
            Version {funnel.version} · updated {updated}
          </p>
          {funnel.hasDraft && <p className="text-sm font-bold">Has unpublished changes</p>}
        </div>
        <span className={`pill ${isLive ? "bg-sage" : "bg-card-2"} text-on-pastel`}>
          {isLive ? "Live" : "Draft"}
        </span>
      </div>

      {isLive ? (
        <Link
          href={`/f/${funnel.slug}`}
          target="_blank"
          className="link -my-3 inline-flex min-h-11 w-fit items-center text-sm font-bold break-all"
        >
          /f/{funnel.slug}
        </Link>
      ) : (
        <p className="text-sm break-all text-muted">/f/{funnel.slug}</p>
      )}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">Started</dt>
        <dd className="tabular-nums">{started}</dd>
        <dt className="text-muted">Signed up</dt>
        <dd className="tabular-nums">
          {signedUp} ({signUpRate}%)
        </dd>
      </dl>

      <div className="flex flex-wrap gap-3">
        <Link href={`/admin/funnels/${funnel.slug}`} className={`${SMALL_BUTTON} btn-primary`}>
          Edit screens
        </Link>
        <Link
          href={`/admin/funnels/${funnel.slug}/try`}
          className={`${SMALL_BUTTON} btn-secondary`}
        >
          Try it
        </Link>
        {isDefault ? (
          <p className="text-sm text-muted">The default funnel is always live.</p>
        ) : (
          <button
            type="button"
            className={`${SMALL_BUTTON} btn-secondary`}
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate(isLive ? "draft" : "live")}
          >
            {isLive ? "Take offline" : "Take live"}
          </button>
        )}
        <button
          ref={duplicateButton}
          type="button"
          className={`${SMALL_BUTTON} btn-secondary`}
          aria-expanded={duplicating}
          onClick={() => setDuplicating((open) => !open)}
        >
          Duplicate
        </button>
      </div>
      {setStatus.isError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {errorText(setStatus.error)}
        </p>
      )}

      {duplicating && (
        <SlugNameForm
          intro={`Copies “${funnel.name}” into a new draft. Take it live when it’s ready.`}
          create={(body) => api.duplicateFunnel(funnel.slug, body)}
          onDone={closeForm}
          onCreated={() => {
            closeForm();
            void refresh();
          }}
        />
      )}
    </article>
  );
}

/** "New funnel": a draft with the default screens, opened in the editor right away. */
function NewFunnel() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <div className="flex flex-col gap-3">
      <button
        ref={button}
        type="button"
        className={`${SMALL_BUTTON} btn-primary w-fit`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="plus" className="size-4" /> New funnel
      </button>
      {open && (
        <div className="card">
          <SlugNameForm
            intro="Starts as a draft with the default funnel’s screens. Remove, reorder and add screens in the editor."
            create={(body) => api.createFunnel(body)}
            onDone={close}
            onCreated={(slug) => {
              void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
              router.push(`/admin/funnels/${slug}`);
            }}
          />
        </div>
      )}
    </div>
  );
}

const INPUT =
  "h-12 w-full rounded-2xl border border-line-2 bg-card px-4 text-ink placeholder:text-muted";

/** A new funnel's link and name: used by "New funnel" and "Duplicate". */
function SlugNameForm({
  intro,
  create,
  onDone,
  onCreated,
}: {
  intro: string;
  create: (body: DuplicateFunnelBody) => Promise<unknown>;
  onDone: () => void;
  onCreated: (slug: string) => void;
}) {
  const id = useId();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const slugInput = useRef<HTMLInputElement>(null);
  // The form opens from a button: start typing in its first field.
  useEffect(() => slugInput.current?.focus(), []);

  const duplicate = useMutation({
    mutationFn: create,
    onSuccess: (_data, body) => onCreated(body.slug),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    // Same rule as the API, checked here so the admin gets a useful message, not "invalid".
    if (!FunnelSlugSchema.safeParse(slug).success) {
      setSlugError("Use lowercase letters, numbers and single dashes, like tiktok-nov.");
      return;
    }
    setSlugError(null);
    duplicate.mutate({ slug, name: name.trim() });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-line pt-4">
      <p className="text-sm text-muted">{intro}</p>
      <label htmlFor={`${id}-slug`} className="text-sm font-bold">
        New link
      </label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted" aria-hidden>
          /f/
        </span>
        <input
          ref={slugInput}
          id={`${id}-slug`}
          className={INPUT}
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={64}
          placeholder="tiktok-nov"
          aria-invalid={slugError ? true : undefined}
          aria-describedby={slugError ? `${id}-slug-error` : undefined}
        />
      </div>
      {slugError && (
        <p id={`${id}-slug-error`} className="text-sm font-medium text-danger">
          {slugError}
        </p>
      )}
      <label htmlFor={`${id}-name`} className="text-sm font-bold">
        Name
      </label>
      <input
        id={`${id}-name`}
        className={INPUT}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={80}
        placeholder="TikTok November"
      />
      {duplicate.isError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {errorText(duplicate.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className={`${SMALL_BUTTON} btn-primary`}
          disabled={duplicate.isPending}
        >
          Create draft
        </button>
        <button type="button" className={`${SMALL_BUTTON} btn-secondary`} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
