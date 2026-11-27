import { DEFAULT_FUNNEL_DEFINITION } from "@speakup/shared";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadFunnel = vi.hoisted(() => vi.fn());
vi.mock("@/funnel/load-funnel", () => ({ loadFunnel }));

const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

const { default: FunnelBySlugLayout } = await import("./layout");
const { FunnelProviderClient } = await import("../../start/funnel-client");

/** Depth-first search of a server component's returned tree for an element of `type`. */
function findElement(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  if (node.type === type) return node;
  const children = node.props.children as ReactNode;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}

const render = (slug: string) =>
  FunnelBySlugLayout({ params: Promise.resolve({ slug }), children: <p>step</p> });

describe("/f/[slug] layout", () => {
  beforeEach(() => loadFunnel.mockReset());

  // The layout (not each page) loads the funnel, so moving between steps neither refetches it nor
  // remounts the provider.
  it("loads the funnel once and wraps the pages in its provider", async () => {
    loadFunnel.mockResolvedValue({
      kind: "ok",
      funnel: { slug: "spring", version: 4, definition: DEFAULT_FUNNEL_DEFINITION },
    });
    const tree = await render("spring");

    expect(loadFunnel).toHaveBeenCalledTimes(1);
    expect(loadFunnel).toHaveBeenCalledWith("spring");
    const provider = findElement(tree, FunnelProviderClient);
    expect(provider?.props).toMatchObject({
      slug: "spring",
      version: 4,
      definition: DEFAULT_FUNNEL_DEFINITION,
      basePath: "/f/spring",
    });
    expect(findElement(provider?.props.children as ReactNode, "p")).not.toBeNull();
  });

  it("404s an unknown funnel", async () => {
    loadFunnel.mockResolvedValue({ kind: "not_found" });
    await expect(render("nope")).rejects.toBe(NOT_FOUND);
  });
});
