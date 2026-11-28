import { SiteHeader } from "@/components/site-header";

/**
 * What a signed-out visitor sees in the real header (app/(product)/layout.tsx), drawn without
 * Clerk: the previews show the funnel as a new visitor meets it. The buttons are plain spans,
 * so the header does nothing if someone clicks it.
 */
export function VisitorHeader() {
  return (
    <SiteHeader homeHref="/">
      <span className="btn btn-sm px-3 text-ink">Sign in</span>
      <span className="btn btn-primary btn-sm">Sign up</span>
    </SiteHeader>
  );
}
