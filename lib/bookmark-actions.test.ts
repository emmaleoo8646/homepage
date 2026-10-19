import { describe, expect, it } from "vitest";
import {
  applyAppendBookmarkToState,
  applyUpdateBookmarkToState,
  applyRemoveBookmarkToState,
  applyUndoRemoveBookmarkToState,
  applyReorderToState,
} from "@/lib/bookmark-actions";
import { initialState, type Bookmark, type HomeState } from "@/lib/home-data";

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------

function bm(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "bm-1",
    name: "Test",
    icon: "",
    url: "https://example.com",
    category: "home",
    folder: null,
    ...overrides,
  };
}

function stateWith(bookmarks: Bookmark[]): HomeState {
  return { ...initialState, bookmarks };
}

// ------------------------------------------------------------------
// applyAppendBookmarkToState
// ------------------------------------------------------------------

describe("applyAppendBookmarkToState", () => {
  it("appends a bookmark to the end", () => {
    const state = stateWith([bm({ id: "a" })]);
    const next = applyAppendBookmarkToState(state, bm({ id: "b" }));
    expect(next.bookmarks.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("returns a new state object (immutable)", () => {
    const state = stateWith([bm()]);
    const next = applyAppendBookmarkToState(state, bm({ id: "x" }));
    expect(next).not.toBe(state);
    expect(next.bookmarks).not.toBe(state.bookmarks);
  });

  it("preserves the rest of the HomeState (todos / note / settings / folders)", () => {
    const state = { ...initialState, note: "hello", todos: [
      { id: "t1", text: "t", done: false },
    ] };
    const next = applyAppendBookmarkToState(state, bm({ id: "x" }));
    expect(next.note).toBe("hello");
    expect(next.todos).toEqual(state.todos);
    expect(next.folders).toBe(state.folders);
    expect(next.settings).toBe(state.settings);
  });
});

// ------------------------------------------------------------------
// applyUpdateBookmarkToState
// ------------------------------------------------------------------

describe("applyUpdateBookmarkToState", () => {
  it("replaces the bookmark with matching id and keeps the rest intact", () => {
    const state = stateWith([
      bm({ id: "a", name: "Old A" }),
      bm({ id: "b", name: "B" }),
    ]);
    const next = applyUpdateBookmarkToState(
      state,
      "a",
      bm({ id: "a", name: "New A", folder: "f-x" }),
    );
    const a = next.bookmarks.find((x) => x.id === "a");
    expect(a?.name).toBe("New A");
    expect(a?.folder).toBe("f-x");
    // b is untouched
    expect(next.bookmarks.find((x) => x.id === "b")?.name).toBe("B");
  });

  it("returns input state unchanged when id doesn't exist", () => {
    const state = stateWith([bm({ id: "a" })]);
    const next = applyUpdateBookmarkToState(state, "ghost", bm({ id: "ghost" }));
    expect(next).not.toBe(state); // still a fresh object (we always spread)
    expect(next.bookmarks).toEqual(state.bookmarks);
  });

  it("supports id changes correctly (does NOT match by anything else)", () => {
    const state = stateWith([bm({ id: "a", name: "A" })]);
    // Pass an id that doesn't match anything — no replacement.
    const next = applyUpdateBookmarkToState(state, "nope", bm({ id: "x" }));
    expect(next.bookmarks.length).toBe(1);
    expect(next.bookmarks[0].id).toBe("a");
  });
});

// ------------------------------------------------------------------
// applyRemoveBookmarkToState
// ------------------------------------------------------------------

describe("applyRemoveBookmarkToState", () => {
  it("drops the bookmark with matching id", () => {
    const state = stateWith([
      bm({ id: "a" }),
      bm({ id: "b" }),
      bm({ id: "c" }),
    ]);
    const next = applyRemoveBookmarkToState(state, "b");
    expect(next.bookmarks.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("keeps every other bookmark intact", () => {
    const state = stateWith([
      bm({ id: "a", folder: "f-a" }),
      bm({ id: "b", folder: null }),
    ]);
    const next = applyRemoveBookmarkToState(state, "a");
    expect(next.bookmarks.find((x) => x.id === "b")?.folder).toBeNull();
  });

  it("returns input state safely when id doesn't exist", () => {
    const state = stateWith([bm({ id: "a" })]);
    const next = applyRemoveBookmarkToState(state, "ghost");
    expect(next.bookmarks).toEqual(state.bookmarks);
  });
});

// ------------------------------------------------------------------
// applyUndoRemoveBookmarkToState
// ------------------------------------------------------------------

describe("applyUndoRemoveBookmarkToState", () => {
  it("re-inserts the bookmark at the original index", () => {
    const state = stateWith([
      bm({ id: "a" }),
      bm({ id: "b" }),
      bm({ id: "c" }),
    ]);
    const removed = applyRemoveBookmarkToState(state, "b");
    const undone = applyUndoRemoveBookmarkToState(
      removed,
      bm({ id: "b" }),
      1,
    );
    expect(undone.bookmarks.map((x) => x.id)).toEqual(["a", "b", "c"]);
    // Full round-trip preserves state.bookmarks identity-wise.
    expect(undone.bookmarks).toEqual(state.bookmarks);
  });

  it("is a no-op when the same id already exists (concurrent re-creation)", () => {
    const state = stateWith([bm({ id: "a" }), bm({ id: "b" })]);
    // Pretend `a` was removed then re-added by some other action before
    // the user clicked Undo.
    const res = applyUndoRemoveBookmarkToState(state, bm({ id: "a" }), 0);
    expect(res.bookmarks.length).toBe(2); // unchanged
  });

  it("clamps the index when other inserts/remove shifted the list", () => {
    const state = stateWith([
      bm({ id: "a" }),
      bm({ id: "b" }),
      bm({ id: "c" }),
    ]);
    const removed = applyRemoveBookmarkToState(state, "a");
    // Now list is [b, c] (length 2). The original index was 0; passing
    // index=5 should clamp to "append at end" — keeps the page stable
    // across concurrent edits rather than crashing.
    const undone = applyUndoRemoveBookmarkToState(
      removed,
      bm({ id: "a" }),
      5,
    );
    expect(undone.bookmarks.length).toBe(3);
    expect(undone.bookmarks[undone.bookmarks.length - 1].id).toBe("a");
  });

  it("clamps negative indices to 0 (prepend)", () => {
    const state = stateWith([bm({ id: "a" }), bm({ id: "b" })]);
    const removed = applyRemoveBookmarkToState(state, "b");
    const undone = applyUndoRemoveBookmarkToState(
      removed,
      bm({ id: "b" }),
      -3,
    );
    expect(undone.bookmarks.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

// ------------------------------------------------------------------
// applyReorderToState
// ------------------------------------------------------------------

describe("applyReorderToState", () => {
  it("moves the source bookmark to the target's position (post-removal)", () => {
    const state = stateWith([
      bm({ id: "a" }),
      bm({ id: "b" }),
      bm({ id: "c" }),
      bm({ id: "d" }),
    ]);
    // Drag "a" (idx 0) onto "c"'s slot. The standard drag-drop semantic
    // is: remove the dragged item first, then insert at the post-removal
    // index of the drop target. Result: [b, c, a, d] — "a" lands right
    // after "c" in the final ordering.
    const next = applyReorderToState(state, "a", "c");
    expect(next.bookmarks.map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("moving a bookmark to its own position is a no-op (and stable ref)", () => {
    const state = stateWith([
      bm({ id: "a" }),
      bm({ id: "b" }),
      bm({ id: "c" }),
    ]);
    const next = applyReorderToState(state, "b", "b");
    expect(next.bookmarks.map((x) => x.id)).toEqual(["a", "b", "c"]);
    // Implementation guard returns the SAME object identity when from === to.
    expect(next).toBe(state);
  });

  it("returns input state when source id is missing", () => {
    const state = stateWith([bm({ id: "a" }), bm({ id: "b" })]);
    const next = applyReorderToState(state, "ghost", "a");
    expect(next.bookmarks).toEqual(state.bookmarks);
  });

  it("returns input state when target id is missing", () => {
    const state = stateWith([bm({ id: "a" })]);
    const next = applyReorderToState(state, "a", "ghost");
    expect(next.bookmarks).toEqual(state.bookmarks);
  });

  it("returns a new state object (does not mutate) on a real move", () => {
    const state = stateWith([bm({ id: "a" }), bm({ id: "b" })]);
    const next = applyReorderToState(state, "a", "b");
    expect(next).not.toBe(state);
    expect(next.bookmarks).not.toBe(state.bookmarks);
  });

  it("can move a bookmark backwards (higher index → lower index)", () => {
    const state = stateWith([
      bm({ id: "a" }),
      bm({ id: "b" }),
      bm({ id: "c" }),
      bm({ id: "d" }),
    ]);
    // "d" → "a": remove d (last), insert at idx 0 → [d, a, b, c]
    const next = applyReorderToState(state, "d", "a");
    expect(next.bookmarks.map((x) => x.id)).toEqual(["d", "a", "b", "c"]);
  });
});

// ------------------------------------------------------------------
// Cross-cutting: full round-trip
// ------------------------------------------------------------------

describe("bookmark actions — full round-trip", () => {
  it("append → update → remove → undo restores", () => {
    let state: HomeState = stateWith([bm({ id: "a" })]);
    state = applyAppendBookmarkToState(state, bm({ id: "b" }));
    expect(state.bookmarks.length).toBe(2);
    state = applyUpdateBookmarkToState(
      state,
      "b",
      bm({ id: "b", name: "B renamed" }),
    );
    expect(state.bookmarks.find((x) => x.id === "b")?.name).toBe("B renamed");
    const removed = applyRemoveBookmarkToState(state, "b");
    expect(removed.bookmarks.length).toBe(1);
    const undone = applyUndoRemoveBookmarkToState(
      removed,
      bm({ id: "b", name: "B renamed" }),
      1,
    );
    expect(undone.bookmarks.length).toBe(2);
    expect(undone.bookmarks[1].name).toBe("B renamed");
  });
});
