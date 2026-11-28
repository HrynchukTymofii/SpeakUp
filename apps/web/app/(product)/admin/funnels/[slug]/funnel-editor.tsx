"use client";

import {
  EditableFunnelDefinitionSchema,
  FUNNEL_SCREEN_LIBRARY,
  type AdminFunnelDetailResponse,
  type FunnelStepDef,
} from "@speakup/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { BackLink } from "@/components/back-link";
import { Icon, type IconName } from "@/components/icons";
import { Mascot } from "@/components/mascot";
import { ApiClientError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ScreenPreview } from "./screen-preview";
import { SCREEN_KINDS, screenName } from "./screens";

/** 44 px tap targets for every control here (design-system.md). */
const SMALL_BUTTON = "btn btn-sm min-h-11";

const detailKey = (slug: string) => ["admin-funnel", slug];

function errorText(error: unknown): string {
  if (error instanceof ApiClientError && error.status < 500) return error.message;
  return "Something went wrong. Please try again.";
}

/** Problems with this order of screens: per screen (by index), and for the whole funnel (-1). */
export function problemsOf(steps: FunnelStepDef[]): Map<number, string[]> {
  const problems = new Map<number, string[]>();
  if (steps.length === 0) return new Map([[-1, ["A funnel needs at least one screen."]]]);
  const result = EditableFunnelDefinitionSchema.safeParse({ version: 1, steps });
  for (const issue of result.error?.issues ?? []) {
    const [field, index] = issue.path;
    const at = field === "steps" && typeof index === "number" ? index : -1;
    problems.set(at, [...(problems.get(at) ?? []), issue.message]);
  }
  return problems;
}

/**
 * Funnel editor (funnel builder part 4): the funnel's screens in order. Admins move, remove and
 * add screens; the screens themselves are code (FUNNEL_SCREEN_LIBRARY). Changes are saved as a
 * draft that visitors don't see until it's published.
 */
export function FunnelEditor({ slug }: { slug: string }) {
  const api = useApi();
  const detail = useQuery({
    queryKey: detailKey(slug),
    queryFn: () => api.getAdminFunnel(slug),
    // 403 / 404 won't change by asking again: show the right screen at once.
    retry: (count, err) => !(err instanceof ApiClientError && err.status < 500) && count < 1,
  });
  // Kept here so they survive the Editor re-mounting after a save.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  if (detail.isPending) return <p className="text-muted">Loading…</p>;
  if (detail.isError) return <LoadError error={detail.error} retry={() => void detail.refetch()} />;

  const { funnel } = detail.data;
  return (
    <>
      <Editor
        // Re-mounts with the server's state after every save, publish or discard.
        key={`${funnel.version}-${funnel.updatedAt}`}
        slug={slug}
        detail={detail.data}
        selectedId={selectedId}
        onSelect={setSelectedId}
        announce={setAnnouncement}
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function LoadError({ error, retry }: { error: Error; retry: () => void }) {
  const status = error instanceof ApiClientError ? error.status : 0;
  const title =
    status === 403
      ? "This page is for admins"
      : status === 404
        ? "There’s no funnel at this link"
        : "Couldn’t load the funnel";
  return (
    <div className="flex flex-col items-center gap-5 pt-10 text-center">
      <Mascot mood="thinking" size={96} />
      <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
      {(status === 0 || status >= 500) && (
        <button type="button" className={`${SMALL_BUTTON} btn-secondary`} onClick={retry}>
          Try again
        </button>
      )}
      {status === 403 ? (
        <BackLink href="/app">Back to the app</BackLink>
      ) : (
        <BackLink href="/admin/funnels">All funnels</BackLink>
      )}
    </div>
  );
}

type Control = "select" | "up" | "down";

function Editor({
  slug,
  detail,
  selectedId,
  onSelect,
  announce: setAnnouncement,
}: {
  slug: string;
  detail: AdminFunnelDetailResponse;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Read out by screen readers: what a move, save or publish just did. */
  announce: (message: string) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const ids = useId();
  const { funnel } = detail;
  const saved = (detail.draft ?? detail.definition).steps;
  const [steps, setSteps] = useState<FunnelStepDef[]>(saved);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [addId, setAddId] = useState("");

  const dirty = JSON.stringify(steps) !== JSON.stringify(saved);
  const problems = problemsOf(steps);
  const selected = steps.find((s) => s.id === selectedId) ?? steps[0];

  // Reordering moves DOM nodes, which can drop focus: put it back on the control that was used.
  const controls = useRef(new Map<string, HTMLElement>());
  const focusTarget = useRef<{ id: string; control: Control } | null>(null);
  // Runs after every render: the one after the move/remove/add that set a target.
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    controls.current.get(`${target.id}:${target.control}`)?.focus();
  });
  const setFocusTarget = (target: { id: string; control: Control }) => {
    focusTarget.current = target;
  };
  const register = (id: string, control: Control) => (el: HTMLElement | null) => {
    if (el) controls.current.set(`${id}:${control}`, el);
    else controls.current.delete(`${id}:${control}`);
  };

  // Unsaved changes are only in this tab: ask before the page is closed or reloaded.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onServerState = (data: AdminFunnelDetailResponse) => {
    queryClient.setQueryData(detailKey(slug), data);
    void queryClient.invalidateQueries({ queryKey: ["admin-funnels"] });
  };
  const save = useMutation({
    mutationFn: () => api.saveFunnelDraft(slug, { version: 1, steps }),
    onSuccess: (data) => {
      onServerState(data);
      setAnnouncement("Changes saved. Visitors don’t see them until you publish.");
    },
  });
  const publish = useMutation({
    mutationFn: () => api.publishFunnel(slug),
    onSuccess: (data) => {
      onServerState(data);
      setAnnouncement(`Published. Visitors now see version ${data.funnel.version}.`);
    },
  });
  const discard = useMutation({
    mutationFn: () => api.discardFunnelDraft(slug),
    onSuccess: (data) => {
      onServerState(data);
      setAnnouncement("Changes discarded.");
    },
  });
  const failed = save.error ?? publish.error ?? discard.error;
  const busy = save.isPending || publish.isPending || discard.isPending;

  function move(index: number, by: -1 | 1, control: Control) {
    const step = steps[index];
    const other = steps[index + by];
    if (!step || !other) return;
    const next = [...steps];
    next[index] = other;
    next[index + by] = step;
    setSteps(next);
    const position = index + by + 1;
    // At the top or bottom that button is now disabled: keep focus on the row.
    const atEdge = position === 1 || position === next.length;
    setFocusTarget({ id: step.id, control: atEdge ? "select" : control });
    setAnnouncement(`Moved “${screenName(step)}” to position ${position} of ${next.length}.`);
  }

  function remove(index: number) {
    const step = steps[index];
    if (!step) return;
    const next = steps.filter((_, i) => i !== index);
    setSteps(next);
    const neighbour = next[index] ?? next[index - 1];
    if (neighbour) setFocusTarget({ id: neighbour.id, control: "select" });
    setAnnouncement(`Removed “${screenName(step)}”. You can add it back below.`);
  }

  const addable = FUNNEL_SCREEN_LIBRARY.filter((s) => !steps.some((own) => own.id === s.id));
  function add() {
    const screen = addable.find((s) => s.id === addId);
    if (!screen) return;
    // New screens go before a closing paywall, the one place a paywall may be.
    const last = steps.at(-1);
    const at = last?.type === "paywall" ? steps.length - 1 : steps.length;
    setSteps([...steps.slice(0, at), screen, ...steps.slice(at)]);
    setAddId("");
    onSelect(screen.id);
    setFocusTarget({ id: screen.id, control: "select" });
    setAnnouncement(`Added “${screenName(screen)}” at position ${at + 1}.`);
  }

  return (
    <>
      <BackLink href="/admin/funnels">All funnels</BackLink>
      <div>
        <h1 className="font-display text-[40px] leading-none font-semibold tracking-tight break-words">
          {funnel.name}
        </h1>
        <p className="mt-2 text-muted">
          /f/{funnel.slug} · {funnel.status === "live" ? "Live" : "Draft"} · visitors see version{" "}
          {funnel.version}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_375px] lg:items-start">
        <section aria-labelledby={`${ids}-screens`} className="flex flex-col gap-4">
          <h2 id={`${ids}-screens`} className="text-xl font-bold tracking-[-0.01em]">
            Screens, in order
          </h2>
          {problems.get(-1)?.map((message) => (
            <p key={message} className="text-sm font-medium text-danger">
              {message}
            </p>
          ))}
          <ol className="flex flex-col gap-2">
            {steps.map((step, i) => {
              const name = screenName(step);
              const isSelected = step.id === selected?.id;
              const rowProblems = problems.get(i);
              return (
                <li
                  key={step.id}
                  className={`card flex flex-col gap-2 p-3 ${isSelected ? "ring-2 ring-ink" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      ref={register(step.id, "select")}
                      type="button"
                      aria-pressed={isSelected}
                      aria-describedby={rowProblems ? `${ids}-problems-${step.id}` : undefined}
                      onClick={() => onSelect(step.id)}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
                    >
                      <span className="w-6 shrink-0 text-center text-sm font-bold text-muted tabular-nums">
                        {i + 1}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-bold break-words">{name}</span>
                        <span className="text-sm text-muted">{SCREEN_KINDS[step.type]}</span>
                      </span>
                    </button>
                    <IconButton
                      ref={register(step.id, "up")}
                      icon="arrowUp"
                      label={`Move “${name}” up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1, "up")}
                    />
                    <IconButton
                      ref={register(step.id, "down")}
                      icon="arrowDown"
                      label={`Move “${name}” down`}
                      disabled={i === steps.length - 1}
                      onClick={() => move(i, 1, "down")}
                    />
                    <IconButton icon="close" label={`Remove “${name}”`} onClick={() => remove(i)} />
                  </div>
                  {rowProblems && (
                    <ul
                      id={`${ids}-problems-${step.id}`}
                      className="ml-9 flex flex-col gap-1 text-sm font-medium text-danger"
                    >
                      {rowProblems.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>

          {addable.length > 0 && (
            <div className="flex flex-col gap-2">
              <label htmlFor={`${ids}-add`} className="text-sm font-bold">
                Add a screen
              </label>
              <div className="flex flex-wrap gap-3">
                <select
                  id={`${ids}-add`}
                  value={addId}
                  onChange={(e) => setAddId(e.target.value)}
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-line-2 bg-card px-4 text-ink"
                >
                  <option value="">Choose a screen…</option>
                  {addable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {screenName(s)} ({SCREEN_KINDS[s.type]})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`${SMALL_BUTTON} btn-secondary`}
                  disabled={!addId}
                  onClick={add}
                >
                  <Icon name="plus" className="size-4" /> Add
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <p className="text-sm text-muted">
              {dirty
                ? "You have unsaved changes."
                : detail.draft
                  ? `Changes saved but not published. Visitors still see version ${funnel.version}.`
                  : "No unpublished changes."}
            </p>
            <div className="flex flex-wrap gap-3">
              {dirty && (
                <button
                  type="button"
                  className={`${SMALL_BUTTON} btn-primary`}
                  disabled={busy || problems.size > 0}
                  onClick={() => save.mutate()}
                >
                  Save changes
                </button>
              )}
              {!dirty && detail.draft && (
                <button
                  type="button"
                  className={`${SMALL_BUTTON} btn-primary`}
                  disabled={busy || problems.size > 0}
                  onClick={() => publish.mutate()}
                >
                  Publish to visitors
                </button>
              )}
              {dirty && (
                <button
                  type="button"
                  className={`${SMALL_BUTTON} btn-secondary`}
                  disabled={busy}
                  onClick={() => {
                    setSteps(saved);
                    setAnnouncement("Unsaved changes undone.");
                  }}
                >
                  Undo unsaved changes
                </button>
              )}
              {!dirty && detail.draft && !confirmDiscard && (
                <button
                  type="button"
                  className={`${SMALL_BUTTON} btn-secondary`}
                  disabled={busy}
                  onClick={() => setConfirmDiscard(true)}
                >
                  Discard changes
                </button>
              )}
            </div>
            {confirmDiscard && (
              <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Discard">
                <p className="text-sm font-medium">
                  Throw away the saved changes and go back to version {funnel.version}?
                </p>
                <button
                  type="button"
                  className={`${SMALL_BUTTON} btn-primary`}
                  disabled={busy}
                  onClick={() => discard.mutate()}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className={`${SMALL_BUTTON} btn-secondary`}
                  onClick={() => setConfirmDiscard(false)}
                >
                  Keep them
                </button>
              </div>
            )}
            {problems.size > 0 && (
              <p className="text-sm font-medium text-danger">
                Fix the problems marked above to save.
              </p>
            )}
            {failed && (
              <p role="alert" className="text-sm font-medium text-danger">
                {errorText(failed)}
              </p>
            )}
          </div>
        </section>

        {selected && (
          <section
            aria-labelledby={`${ids}-preview`}
            className="flex flex-col gap-3 lg:sticky lg:top-4"
          >
            <h2 id={`${ids}-preview`} className="text-xl font-bold tracking-[-0.01em]">
              Preview
            </h2>
            <ScreenPreview step={selected} />
          </section>
        )}
      </div>
    </>
  );
}

function IconButton({
  ref,
  icon,
  label,
  disabled,
  onClick,
}: {
  ref?: (el: HTMLButtonElement | null) => void;
  icon: IconName;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card text-ink transition-colors hover:bg-card-2 disabled:opacity-40"
    >
      <Icon name={icon} className="size-5" />
    </button>
  );
}
