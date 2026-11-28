/**
 * The app icons in `public/icons`, generated from the Mascot by
 * `pnpm --filter @speakup/web icons` (scripts/generate-pwa-icons.tsx).
 * - `any`: the manifest's regular icons (Android/desktop launchers).
 * - `maskable`: the manifest's maskable icon; the mascot stays in the central safe zone so
 *   launchers can crop it to any shape.
 * - `apple`: the `apple-touch-icon` for iOS home screens (not listed in the manifest).
 */
export type PwaIconPurpose = "any" | "maskable" | "apple";

export type PwaIcon = {
  file: string;
  size: number;
  purpose: PwaIconPurpose;
};

export const PWA_ICONS: readonly PwaIcon[] = [
  { file: "icon-192.png", size: 192, purpose: "any" },
  { file: "icon-512.png", size: 512, purpose: "any" },
  { file: "icon-maskable-512.png", size: 512, purpose: "maskable" },
  { file: "apple-touch-icon.png", size: 180, purpose: "apple" },
];

/** Public URL of an icon file (`/icons/icon-192.png`). */
export function pwaIconSrc(icon: PwaIcon): string {
  return `/icons/${icon.file}`;
}
