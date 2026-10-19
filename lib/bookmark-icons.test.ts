import { describe, expect, it } from "vitest";
import {
  bookmarkIconSources,
  isBundledIcon,
} from "@/lib/bookmark-icons";

describe("isBundledIcon", () => {
  it("treats a non-empty bundled filename as bundled", () => {
    expect(isBundledIcon("weibo.png")).toBe(true);
    expect(isBundledIcon("huaban")).toBe(true);
  });

  it("treats empty / null / undefined as not-bundled", () => {
    expect(isBundledIcon("")).toBe(false);
    expect(isBundledIcon(null)).toBe(false);
    expect(isBundledIcon(undefined)).toBe(false);
  });

  it("treats data: URLs as not-bundled", () => {
    expect(isBundledIcon("data:image/png;base64,abc")).toBe(false);
    expect(isBundledIcon("data:image/svg+xml;utf8,<svg/>")).toBe(false);
  });

  it("treats absolute http/https URLs as not-bundled", () => {
    expect(isBundledIcon("https://example.com/icon.png")).toBe(false);
    expect(isBundledIcon("http://example.com/icon.png")).toBe(false);
  });
});

describe("bookmarkIconSources", () => {
  describe("data: URLs", () => {
    it("returns the data URL untouched when icon is data: image/png", () => {
      const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
      expect(bookmarkIconSources(dataUrl)).toEqual([dataUrl]);
    });

    it("returns the data URL untouched when icon is data: svg+xml", () => {
      const dataUrl = "data:image/svg+xml;utf8,<svg/>";
      expect(bookmarkIconSources(dataUrl)).toEqual([dataUrl]);
    });

    it("does NOT append favicon chain when icon is a data URL (would have triggered a 5s 404 before this fix)", () => {
      const dataUrl = "data:image/png;base64,xxxx";
      const sources = bookmarkIconSources(dataUrl, "https://example.com/page");
      expect(sources).toEqual([dataUrl]);
      expect(sources).not.toContainEqual(
        expect.stringContaining("/assets/data:"),
      );
    });
  });

  describe("http(s) URLs as icon", () => {
    it("returns the absolute URL untouched", () => {
      const u = "https://cdn.example.com/icon.png";
      expect(bookmarkIconSources(u)).toEqual([u]);
    });
  });

  describe("bundled asset filenames", () => {
    it("prefixes with /assets/ when icon is a filename", () => {
      expect(bookmarkIconSources("weibo.png")).toEqual(["/assets/weibo.png"]);
      expect(bookmarkIconSources("huaban")).toEqual(["/assets/huaban"]);
    });

    it("does NOT prepend /assets/ when icon is empty (uses url chain only)", () => {
      expect(bookmarkIconSources("", "https://example.com/page")).toEqual([
        "https://example.com/favicon.ico",
        "https://example.com/favicon.svg",
        "https://example.com/apple-touch-icon.png",
        expect.stringMatching(/^https:\/\/icons\.duckduckgo\.com\/ip3\//),
      ]);
    });
  });

  describe("favicon chain (when icon is empty or bundled)", () => {
    it("includes /favicon.ico, /favicon.svg, /apple-touch-icon.png, and the DuckDuckGo fallback", () => {
      const sources = bookmarkIconSources(
        "weibo.png",
        "https://example.com/page",
      );
      expect(sources[0]).toBe("/assets/weibo.png");
      expect(sources).toContain("https://example.com/favicon.ico");
      expect(sources).toContain("https://example.com/favicon.svg");
      expect(sources).toContain(
        "https://example.com/apple-touch-icon.png",
      );
    });

    it("upgrades http to https in favicon URLs (no mixed-content image requests)", () => {
      const sources = bookmarkIconSources("", "http://example.com/page");
      for (const s of sources) {
        if (s.startsWith("http://")) {
          throw new Error(`unexpected http source: ${s}`);
        }
      }
      expect(sources).toContain("https://example.com/favicon.ico");
      expect(sources).toContain("https://example.com/favicon.svg");
    });

    it("encodes the hostname (not the path) in the DuckDuckGo fallback", () => {
      const sources = bookmarkIconSources(
        "",
        "https://example.com/some/path?q=space here",
      );
      const ddg = sources.find((s) => s.includes("duckduckgo.com"));
      expect(ddg).toBeDefined();
      // DDG endpoint takes only hostname; query/path are intentionally dropped.
      expect(ddg).toBe(
        `https://icons.duckduckgo.com/ip3/${encodeURIComponent("example.com")}.ico`,
      );
    });

    it("deduplicates via Set when bundled icon name happens to match a favicon URL", () => {
      // Hypothetical: a bundled file literally named "favicon.ico" — the
      // /assets/favicon.ico source and https://…/favicon.ico would collide.
      const sources = bookmarkIconSources("favicon.ico", "https://x.com");
      const occurrences = sources.filter(
        (s) => s === "/assets/favicon.ico",
      ).length;
      expect(occurrences).toBe(1);
    });

    it("falls back to /favicon.ico from url only — no /assets collision — when icon is empty", () => {
      const sources = bookmarkIconSources("", "https://x.com/page");
      // first source should be the favicon chain (no /assets entry)
      expect(sources[0]).not.toMatch(/^\/assets\//);
      expect(sources[0]).toBe("https://x.com/favicon.ico");
    });
  });

  describe("URL hygiene", () => {
    it("ignores non-http(s) URLs and returns whatever bundled artwork exists", () => {
      // javascript: is a real-world example that the URL parser should
      // reject; this codepath is also what blocks file:// etc.
      const sources = bookmarkIconSources("weibo.png", "javascript:alert(1)");
      expect(sources[0]).toBe("/assets/weibo.png");
      // No origin => no favicon chain either.
      expect(sources).toHaveLength(1);
    });

    it("returns just the bundled entry when url is malformed", () => {
      const sources = bookmarkIconSources("weibo.png", "not a url");
      expect(sources).toEqual(["/assets/weibo.png"]);
    });

    it("returns an empty array when neither icon nor url is provided", () => {
      expect(bookmarkIconSources("", "")).toEqual([]);
    });
  });
});
