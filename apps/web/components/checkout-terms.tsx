import { siteHref } from "@/lib/links";

/**
 * The line under every checkout button. The legal pages live on the marketing host, so the links
 * are absolute once the domain split is on. They open in a new tab so the checkout isn't lost.
 */
export function CheckoutTerms({ className = "text-muted" }: { className?: string }) {
  return (
    <p className={`text-center text-xs ${className}`}>
      By subscribing you agree to our{" "}
      <a href={siteHref("/terms")} target="_blank" rel="noopener" className="font-bold underline">
        Terms
      </a>{" "}
      and{" "}
      <a href={siteHref("/refund")} target="_blank" rel="noopener" className="font-bold underline">
        Refund policy
      </a>
      .
    </p>
  );
}
