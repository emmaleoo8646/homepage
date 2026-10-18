import { describe, expect, it } from "vitest";
import {
  bookmarkSchema,
  initialState,
  migrateToV2,
  stateSchema,
  type Bookmark,
} from "@/lib/home-data";

/**
 * v1→v2 migration is the most critical schema-touching code in the repo:
 * it has to (a) parse the legacy blob without surfacing `storageError`
 * and (b) re-seed the entertainment folder only when bookmarks still
 * reference it. The other tests below assert the live `initialState`
 * and `stateSchema` are self-consistent.
 */
describe("migrateToV2", () => {
  it("accepts a fresh v2 blob unchanged (no-op pass-through)", () => {
    const v2Blob = JSON.parse(JSON.stringify(initialState));
    const r = migrateToV2(v2Blob);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.version).toBe(2);
    expect(r.state.folders.length).toBe(initialState.folders.length);
  });

  it("upgrades a v1 blob and seeds the entertainment folder when references still exist", () => {
    const v1Blob = {
      version: 1,
      bookmarks: [
        {
          id: "home-0",
          name: "微博",
          icon: "weibo.png",
          url: "https://weibo.com",
          category: "home",
          folder: null,
        },
        {
          id: "ent-0",
          name: "爱奇艺",
          icon: "iqiy_hipc.png",
          url: "https://www.iqiyi.com",
          category: "home",
          folder: "entertainment",
        },
        {
          id: "design-0",
          name: "花瓣",
          icon: "huaban.png",
          url: "https://huaban.com",
          category: "design",
          folder: null,
        },
      ],
      todos: [
        { id: "todo-1", text: "喝一杯水", done: false },
      ],
      note: "",
      settings: {
        engine: "baidu",
        wallpaper: "night-city",
        color: "#18324a",
        overlay: 30,
        theme: "light",
        showTime: false,
        showWidgets: true,
        showQuote: true,
      },
      quoteIndex: 0,
    };
    const r = migrateToV2(v1Blob);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.version).toBe(2);
    // The entertainment folder is back, named exactly as the legacy
    // hardcoded value so older users don't see a name change.
    expect(r.state.folders).toEqual([
      { id: "entertainment", name: "娱乐", category: "home" },
    ]);
    // Bookmarks are preserved verbatim (folder FK still resolves).
    expect(r.state.bookmarks.length).toBe(3);
    expect(
      r.state.bookmarks.filter((b) => b.folder === "entertainment"),
    ).toHaveLength(1);
  });

  it("upgrades a v1 blob without entertainment refs by leaving folders empty", () => {
    const v1Blob = {
      version: 1,
      bookmarks: [
        {
          id: "design-0",
          name: "花瓣",
          icon: "huaban.png",
          url: "https://huaban.com",
          category: "design",
          folder: null,
        },
      ],
      todos: [],
      note: "",
      settings: {
        engine: "baidu",
        wallpaper: "night-city",
        color: "#18324a",
        overlay: 30,
        theme: "light",
        showTime: false,
        showWidgets: true,
        showQuote: true,
      },
      quoteIndex: 0,
    };
    const r = migrateToV2(v1Blob);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.folders).toEqual([]);
    expect(r.state.bookmarks[0].folder).toBe(null);
  });

  it("reports ok:false on garbage input so the loader can fall back to defaults", () => {
    const r = migrateToV2({ not: "a state" });
    expect(r.ok).toBe(false);
  });

  it("rejects malformed v1 with ok:false rather than crashing", () => {
    const r = migrateToV2({
      version: 1,
      bookmarks: "not-an-array",
      todos: [],
      note: "",
      settings: {
        engine: "baidu",
        wallpaper: "night-city",
        color: "#18324a",
        overlay: 30,
        theme: "light",
        showTime: false,
        showWidgets: true,
        showQuote: true,
      },
      quoteIndex: 0,
    } as unknown);
    expect(r.ok).toBe(false);
  });
});

describe("initialState (v2)", () => {
  it("is a valid v2 state (round-trips through stateSchema)", () => {
    const parsed = stateSchema.parse(initialState);
    expect(parsed.version).toBe(2);
    expect(parsed.folders.length).toBeGreaterThan(0);
    expect(parsed.bookmarks.length).toBeGreaterThan(0);
  });

  it("pre-seeds the entertainment folder so the home widget has content on first load", () => {
    const entertainment = initialState.folders.find((f) => f.id === "entertainment");
    expect(entertainment).toBeDefined();
    expect(entertainment?.category).toBe("home");
    const ent = initialState.bookmarks.filter((b) => b.folder === "entertainment");
    expect(ent.length).toBeGreaterThan(0);
  });

  it("uses defaults the rest of the app depends on (engine=baidu, theme=light, showWidgets=true)", () => {
    expect(initialState.settings.engine).toBe("baidu");
    expect(initialState.settings.theme).toBe("light");
    expect(initialState.settings.showWidgets).toBe(true);
  });
});

describe("bookmarkSchema", () => {
  it("accepts every seed bookmark from initialState", () => {
    for (const bm of initialState.bookmarks) {
      // Round-trip through the schema — any field mismatch surfaces here.
      const validated = bookmarkSchema.parse(bm);
      expect(validated.id).toBe(bm.id);
    }
  });

  it("rejects a bookmark with an empty name", () => {
    const r = bookmarkSchema.safeParse({
      id: "test",
      name: "",
      icon: "",
      url: "https://example.com",
      category: "home",
      folder: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a bookmark whose url is not http(s)", () => {
    const r = bookmarkSchema.safeParse({
      id: "test",
      name: "n",
      icon: "",
      url: "javascript:alert(1)",
      category: "home",
      folder: null,
    });
    expect(r.success).toBe(false);
  });

  it("accepts a data: URL in the icon field (image-upload feature)", () => {
    const r = bookmarkSchema.parse({
      id: "test-data-url",
      name: "custom",
      icon: "data:image/png;base64,iVBORw0KGgo=",
      url: "https://example.com",
      category: "home",
      folder: null,
    } satisfies Bookmark);
    expect(r.icon.startsWith("data:")).toBe(true);
  });
});
