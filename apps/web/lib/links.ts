import { publicEnv } from "./env";
import { hrefOn } from "./hosts";

/** Link to a product page (funnel, sign-in, dashboard, pricing) from anywhere. See lib/hosts.ts. */
export const appHref = (path: string) => hrefOn(publicEnv.NEXT_PUBLIC_APP_URL, path);

/** Link to a marketing page (landing, legal) from anywhere. See lib/hosts.ts. */
export const siteHref = (path: string) => hrefOn(publicEnv.NEXT_PUBLIC_SITE_URL, path);
