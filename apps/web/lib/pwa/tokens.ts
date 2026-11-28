/** Theme tokens by name without the leading `--` (e.g. `page` → `#f7f7fa`). */
export type CssTokens = Record<string, string>;

/**
 * Reads the custom properties of the first `:root { … }` block in a stylesheet (globals.css).
 * Used by the icon generator, which has to inline the Mascot's `var(--x)` colours because image
 * rasterizers don't resolve CSS variables.
 */
export function parseCssTokens(css: string): CssTokens {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const root = withoutComments.match(/:root\s*\{([^}]*)\}/);
  const tokens: CssTokens = {};
  if (!root?.[1]) return tokens;
  for (const [, name, value] of root[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) tokens[name] = value.trim().replace(/\s+/g, " ");
  }
  return tokens;
}

/**
 * The installed app's theme and splash background: the `--page` token. Kept as a literal so the
 * manifest doesn't read CSS at runtime; a test keeps it equal to globals.css.
 */
export const PWA_THEME_COLOR = "#f7f7fa";
