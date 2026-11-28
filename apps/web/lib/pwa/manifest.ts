import { PWA_ICONS, pwaIconSrc } from "./icons";
import { PWA_THEME_COLOR } from "./tokens";

/** Where the installed app opens. The one place to change it (the install screen links here too). */
export const PWA_START_URL = "/app";

export type WebManifestIcon = {
  src: string;
  sizes: string;
  type: "image/png";
  purpose: "any" | "maskable";
};

export type WebManifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "standalone";
  theme_color: string;
  background_color: string;
  icons: WebManifestIcon[];
};

/**
 * The web app manifest served at `/speakup.webmanifest` and linked only from product pages, so
 * the app host is installable and the marketing host is not.
 */
export function buildManifest(): WebManifest {
  return {
    // Browsers identify the installed app by `id`; pinning it lets start_url change later without
    // users ending up with a second copy of the app.
    id: "/",
    name: "SpeakUp",
    short_name: "SpeakUp",
    description:
      "Record yourself speaking and get feedback on pace, pauses, filler words and clarity.",
    start_url: PWA_START_URL,
    scope: "/",
    display: "standalone",
    theme_color: PWA_THEME_COLOR,
    background_color: PWA_THEME_COLOR,
    // The Apple touch icon is a <link> in the product layout; iOS ignores manifest icons.
    icons: PWA_ICONS.flatMap((icon) =>
      icon.purpose === "apple"
        ? []
        : [
            {
              src: pwaIconSrc(icon),
              sizes: `${icon.size}x${icon.size}`,
              type: "image/png" as const,
              purpose: icon.purpose,
            },
          ],
    ),
  };
}
