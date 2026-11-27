import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

/**
 * Text "back" link at the top of a screen. The text is only ~20 px tall, so `min-h-11` gives it
 * a 44 px tap area and `-my-3` takes those extra 24 px back out of the layout: the page looks
 * and flows exactly as with a plain text link. Parents need a gap of at least 12 px around it
 * so the stretched tap area doesn't cover a neighbouring control.
 */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="link -my-3 inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-bold"
    >
      <Icon name="arrowLeft" className="size-4" />
      {children}
    </Link>
  );
}
