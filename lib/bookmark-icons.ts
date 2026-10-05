/** Keep bundled artwork first, then try the site's own icons before a cached copy. */
export function bookmarkIconSources(icon: string, url?: string): string[] {
  const sources = icon ? [`/assets/${icon}`] : [];
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
