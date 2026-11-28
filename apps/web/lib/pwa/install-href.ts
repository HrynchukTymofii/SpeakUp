import { z } from "zod";
import { PWA_START_URL } from "./manifest";
import { INSTALL_PLACEMENTS, type InstallPlacement } from "./install-platform";

/**
 * Link to the install screen: `from` says where the offer came from (sent with the install
 * analytics events), `next` is where "Not now, continue" — or an already installed app — goes.
 */
export function installHref(from: InstallPlacement, next: string = PWA_START_URL): string {
  return `/install?${new URLSearchParams({ from, next }).toString()}`;
}

// `next` comes from the URL, so anyone can craft it: only same-origin paths, never "//host" or
// "/\host" (both leave the site), and no control characters or spaces, which browsers strip and
// could turn "/\t/host" into "//host".
const SafeNextPath = z
  .string()
  .regex(/^\/(?![/\\])[^\s\x00-\x1f\x7f]*$/)
  .catch(PWA_START_URL);

const InstallParams = z.object({
  from: z.enum(INSTALL_PLACEMENTS).catch("direct"),
  next: SafeNextPath,
});

export type InstallParams = z.infer<typeof InstallParams>;

/** Reads `?from=&next=` for the install screen; anything missing or unsafe gets the default. */
export function parseInstallParams(params: { get(name: string): string | null }): InstallParams {
  return InstallParams.parse({
    from: params.get("from") ?? undefined,
    next: params.get("next") ?? undefined,
  });
}
