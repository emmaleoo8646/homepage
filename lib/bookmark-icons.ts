/**
 * Resolve the candidate image sources for a bookmark icon. Sources are
 * tried in order until one loads (see components/bookmark-icon.tsx).
 *
 * The `icon` field is permissive: it may be
 *   - a bundled asset filename ("weibo.png" → /assets/weibo.png)
 *   - a self-contained data URL ("data:image/png;base64,…", from a user
 *     upload — see lib/icon-upload.ts)
 *   - an absolute https/http URL (rare but supported)
 *   - empty (caller falls back to the favicon chain for `url`)
 */
export function bookmarkIconSources(icon: string, url?: string): string[] {
  // Self-contained or remote URL: use it as the only candidate. Doing this
  // *before* the `/assets/${icon}` branch is what avoids the previous bug
  // where a data URL would be slugged as `/assets/data:image/png;base64,…`
  // and trigger a guaranteed 404 + 5s timeout before any fallback fired.
  if (icon) {
    if (icon.startsWith("data:") || /^https?:\/\//.test(icon)) {
      return [icon];
    }
  }

  const sources: string[] = [];
  if (icon) sources.push(`/assets/${icon}`);
  if (!url) return sources;

  try {
    const site = new URL(url);
    if (site.protocol !== "http:" && site.protocol !== "https:") return sources;
    // Avoid mixed-content image requests when the homepage is served over HTTPS.
    site.protocol = "https:";
    sources.push(
      `${site.origin}/favicon.ico`,
      `${site.origin}/favicon.svg`,
      `${site.origin}/apple-touch-icon.png`,
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(site.hostname)}.ico`,
    );
  } catch {
    // Invalid URLs still retain any bundled artwork and the text fallback.
  }

  return [...new Set(sources)];
}

/**
 * True if `icon` is the name of a bundled `/assets/<name>` file (i.e. not
 * a data URL or absolute URL). Used by the bookmark form to decide how to
 * render the preview thumbnail without hitting the favicon chain.
 */
export function isBundledIcon(icon: string | null | undefined): boolean {
  return !!icon && !icon.startsWith("data:") && !/^https?:\/\//.test(icon);
}
