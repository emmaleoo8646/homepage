import { describe, expect, it } from "vitest";
import {
  applyMergeToState,
  applyUndoMergeToState,
  applyBookmarkIntoFolderToState,
  applyUndoBookmarkIntoFolderToState,
  applyUngroupToState,
  applyUndoUngroupToState,
  applyRemoveFolderToState,
  applyRenameFolderToState,
  applyNewFolderToState,
  applyCollapseSoloFoldersToState,
  applyPruneDanglingBookmarkFKs,
  snapshotMergeUndo,
  makeFolder,
  findBookmark,
  findFolder,
} from "@/lib/folder-actions";
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
  return {
    ...initialState,
    bookmarks,
    folders: [
      { id: "f-a", name: "A", category: "home" },
      { id: "f-b", name: "B", category: "home" },
    ],
  };
}

// ------------------------------------------------------------------
// applyMergeToState
// ------------------------------------------------------------------

describe("applyMergeToState", () => {
  it("moves both source and target bookmarks into the target folder", () => {
    const state = stateWith([
      bm({ id: "a", folder: null }),
      bm({ id: "b", folder: null }),
      bm({ id: "c", folder: "f-elsewhere" }),
    ]);
    const next = applyMergeToState(state, "a", "b", "f-b");
    expect(next.bookmarks.find((x) => x.id === "a")?.folder).toBe("f-b");
    expect(next.bookmarks.find((x) => x.id === "b")?.folder).toBe("f-b");
  });

  it("leaves every other bookmark's folder untouched", () => {
    const state = stateWith([
      bm({ id: "a", folder: null }),
      bm({ id: "b", folder: "f-external" }),
      bm({ id: "c", folder: "f-b" }),
    ]);
    const next = applyMergeToState(state, "a", "b", "f-b");
    expect(next.bookmarks.find((x) => x.id === "c")?.folder).toBe("f-b");
    expect(next.bookmarks.find((x) => x.id === "b")?.folder).toBe("f-b");
    // a also moved, so c's folder isn't expected to change here.
    // We assert the *unrelated* posture is the same.
    void next;
  });

  it("returns a new state object (does not mutate)", () => {
    const state = stateWith([bm({ id: "a" }), bm({ id: "b" })]);
    const next = applyMergeToState(state, "a", "b", "f-a");
    expect(next).not.toBe(state);
    expect(next.bookmarks).not.toBe(state.bookmarks);
    // Source state is untouched.
    expect(state.bookmarks.find((x) => x.id === "a")?.folder).toBeNull();
  });

  it("is idempotent on a re-application (running twice has the same effect)", () => {
    const state = stateWith([bm({ id: "a" }), bm({ id: "b" })]);
    const once = applyMergeToState(state, "a", "b", "f-a");
    const twice = applyMergeToState(once, "a", "b", "f-a");
    expect(twice.bookmarks).toEqual(once.bookmarks);
  });

  it("is a no-op if neither id exists", () => {
    const state = stateWith([bm({ id: "a" })]);
    const next = applyMergeToState(state, "ghost", "phantom", "f-a");
    expect(next.bookmarks).toEqual(state.bookmarks);
    // Different object identity because we always spread, but contents match.
    expect(next).not.toBe(state);
  });
});

// ------------------------------------------------------------------
// applyUndoMergeToState (+ snapshotMergeUndo)
// ------------------------------------------------------------------

describe("applyUndoMergeToState + snapshotMergeUndo", () => {
  it("snapshotMergeUndo captures pre-merge folder FKs for both bookmarks", () => {
    const state = stateWith([
      bm({ id: "a", folder: "f-old-a" }),
      bm({ id: "b", folder: null }),
    ]);
    const snap = snapshotMergeUndo(state, "a", "b");
    expect(snap.sourcePrev).toBe("f-old-a");
    expect(snap.targetPrev).toBeNull();
    expect(snap.prevFolders).toBe(state.folders);
  });

  it("snapshot handles missing source/target ids safely", () => {
    const state = stateWith([bm({ id: "a" })]);
    const snap = snapshotMergeUndo(state, "ghost", "phantom");
    expect(snap.sourcePrev).toBeNull();
    expect(snap.targetPrev).toBeNull();
  });

  it("applyUndoMergeToState restores FKs and the folders array", () => {
    const state = stateWith([
      bm({ id: "a", folder: null }),
      bm({ id: "b", folder: "f-existing" }),
    ]);
    // Merge into a brand-new folder.
    const merged = applyNewFolderToState(state, makeFolder("f-new", "new", "home"));
    const merged2 = applyMergeToState(merged, "a", "b", "f-new");
    const snap = snapshotMergeUndo(state, "a", "b");
    // Undo should restore folders (without the new one) and FKs.
    const undone = applyUndoMergeToState(
      merged2,
      "a",
      "b",
      snap.sourcePrev,
      snap.targetPrev,
      snap.prevFolders,
    );
    expect(undone.folders.find((f) => f.id === "f-new")).toBeUndefined();
    expect(undone.bookmarks.find((x) => x.id === "a")?.folder).toBeNull();
    expect(undone.bookmarks.find((x) => x.id === "b")?.folder).toBe("f-existing");
  });

  it("snapshotMergeUndo + applyUndoMergeToState compose a clean round-trip", () => {
    const state = stateWith([
      bm({ id: "a", folder: "f-a" }),
      bm({ id: "b", folder: "f-a" }),
      bm({ id: "c", folder: "f-b" }),
    ]);
    const snap = snapshotMergeUndo(state, "a", "b");
    const merged = applyMergeToState(state, "a", "b", "f-b");
    const reverted = applyUndoMergeToState(
      merged,
      "a",
      "b",
      snap.sourcePrev,
      snap.targetPrev,
      snap.prevFolders,
    );
    expect(reverted.bookmarks).toEqual(state.bookmarks);
    expect(reverted.folders).toEqual(state.folders);
  });
});

// ------------------------------------------------------------------
// applyUngroupToState / applyUndoUngroupToState
// ------------------------------------------------------------------

describe("applyUngroupToState", () => {
  it("sets the bookmark's folder to null", () => {
    const state = stateWith([bm({ id: "a", folder: "f-a" })]);
    const next = applyUngroupToState(state, "a");
    expect(next.bookmarks.find((x) => x.id === "a")?.folder).toBeNull();
  });

  it("is a no-op for bookmarks already in no folder", () => {
    const state = stateWith([bm({ id: "a", folder: null })]);
    const next = applyUngroupToState(state, "a");
    expect(next.bookmarks).toEqual(state.bookmarks);
  });

  it("leaves other bookmarks' folder FKs untouched", () => {
    const state = stateWith([
      bm({ id: "a", folder: "f-a" }),
      bm({ id: "b", folder: "f-b" }),
    ]);
    const next = applyUngroupToState(state, "a");
    expect(next.bookmarks.find((x) => x.id === "b")?.folder).toBe("f-b");
  });
});

describe("applyUndoUngroupToState", () => {
  it("restores the prev folder on the ungrouped bookmark", () => {
    const state = stateWith([bm({ id: "a", folder: "f-a" })]);
    const out = applyUngroupToState(state, "a");
    const back = applyUndoUngroupToState(out, "a", "f-a");
    expect(back.bookmarks).toEqual(state.bookmarks);
  });

  it("round-trips null ↔ null (no-op)", () => {
    const state = stateWith([bm({ id: "a", folder: null })]);
    const back = applyUndoUngroupToState(state, "a", null);
    expect(back.bookmarks).toEqual(state.bookmarks);
  });
});

// ------------------------------------------------------------------
// applyRemoveFolderToState
// ------------------------------------------------------------------

describe("applyRemoveFolderToState", () => {
  it("removes the folder row from `folders`", () => {
    const state = stateWith([bm()]);
    const next = applyRemoveFolderToState(state, "f-a");
    expect(next.folders.map((f) => f.id)).not.toContain("f-a");
  });

  it("nulls every member's folder FK so no dangling reference survives", () => {
    const state = stateWith([
      bm({ id: "a", folder: "f-a" }),
      bm({ id: "b", folder: "f-a" }),
      bm({ id: "c", folder: "f-b" }),
    ]);
    const next = applyRemoveFolderToState(state, "f-a");
    expect(next.bookmarks.find((x) => x.id === "a")?.folder).toBeNull();
    expect(next.bookmarks.find((x) => x.id === "b")?.folder).toBeNull();
    // c is unaffected.
    expect(next.bookmarks.find((x) => x.id === "c")?.folder).toBe("f-b");
  });

  it("preserves unrelated folders", () => {
    const state = stateWith([bm()]);
    const next = applyRemoveFolderToState(state, "f-a");
    expect(next.folders.find((f) => f.id === "f-b")).toEqual({
      id: "f-b",
      name: "B",
      category: "home",
    });
  });

  it("is a no-op if the folder id doesn't exist (still returns next state)", () => {
    const state = stateWith([bm()]);
    const next = applyRemoveFolderToState(state, "f-missing");
    expect(next.folders).toEqual(state.folders);
    expect(next.bookmarks).toEqual(state.bookmarks);
  });
});

// ------------------------------------------------------------------
// applyRenameFolderToState
// ------------------------------------------------------------------

describe("applyRenameFolderToState", () => {
  it("renames the folder to the trimmed value", () => {
    const state = stateWith([bm()]);
    const next = applyRenameFolderToState(state, "f-a", "  Inspiration  ");
    expect(next.folders.find((f) => f.id === "f-a")?.name).toBe("Inspiration");
  });

  it("clamps names longer than 20 chars to the first 20 (schema parity)", () => {
    const state = stateWith([bm()]);
    const longName = "x".repeat(40);
    const next = applyRenameFolderToState(state, "f-a", longName);
    expect(next.folders.find((f) => f.id === "f-a")?.name.length).toBe(20);
  });

  it("treats all-whitespace name as a no-op (preserves the original)", () => {
    const state = stateWith([bm()]);
    const next = applyRenameFolderToState(state, "f-a", "    ");
    expect(next).toEqual(state);
  });

  it("does not touch other folders", () => {
    const state = stateWith([bm()]);
    const next = applyRenameFolderToState(state, "f-a", "Renamed");
    expect(next.folders.find((f) => f.id === "f-b")?.name).toBe("B");
  });

  it("leaves unrelated bookmarks alone", () => {
    const state = stateWith([
      bm({ id: "a", folder: "f-a" }),
      bm({ id: "b", folder: "f-b" }),
    ]);
    const next = applyRenameFolderToState(state, "f-a", "Renamed");
    expect(next.bookmarks.find((x) => x.id === "b")?.folder).toBe("f-b");
  });
});

// ------------------------------------------------------------------
// applyNewFolderToState + makeFolder
// ------------------------------------------------------------------

describe("applyNewFolderToState + makeFolder", () => {
  it("appends a new folder row", () => {
    const state = stateWith([bm()]);
    const next = applyNewFolderToState(
      state,
      makeFolder("f-new", "Inspiration", "home"),
    );
    expect(next.folders.find((f) => f.id === "f-new")?.name).toBe(
      "Inspiration",
    );
    expect(next.folders.length).toBe(state.folders.length + 1);
  });

  it("makeFolder produces a well-typed Folder row", () => {
    const f = makeFolder("x", "y", "design");
    expect(f).toEqual({ id: "x", name: "y", category: "design" });
  });
});

// ------------------------------------------------------------------
// applyBookmarkIntoFolderToState
// ------------------------------------------------------------------

describe("applyBookmarkIntoFolderToState", () => {
  it("moves the target bookmark into folderId", () => {
    const state = stateWith([
      bm({ id: "a", folder: null }),
      bm({ id: "b", folder: "f-a" }),
    ]);
    const next = applyBookmarkIntoFolderToState(state, "a", "f-a");
    expect(next.bookmarks.find((x) => x.id === "a")?.folder).toBe("f-a");
    expect(next.bookmarks.find((x) => x.id === "b")?.folder).toBe("f-a");
  });

  it("is idempotent when the bookmark already lives in folderId (still updates FK to the same value)", () => {
    const state = stateWith([bm({ id: "a", folder: "f-a" })]);
    const next = applyBookmarkIntoFolderToState(state, "a", "f-a");
    expect(next.bookmarks.find((x) => x.id === "a")?.folder).toBe("f-a");
  });

  it("leaves unrelated bookmarks' folder FKs untouched", () => {
    const state = stateWith([
      bm({ id: "a", folder: null }),
      bm({ id: "c", folder: "f-b" }),
    ]);
    const next = applyBookmarkIntoFolderToState(state, "a", "f-a");
    expect(next.bookmarks.find((x) => x.id === "c")?.folder).toBe("f-b");
  });

  it("is a no-op on a missing bookmark id (returns next, content unchanged)", () => {
    const state = stateWith([bm({ id: "a", folder: null })]);
    const next = applyBookmarkIntoFolderToState(state, "ghost", "f-a");
    expect(next.bookmarks).toEqual(state.bookmarks);
    expect(next).not.toBe(state);
  });

  it("returns a new state object (does not mutate)", () => {
    const state = stateWith([bm({ id: "a", folder: null })]);
    const next = applyBookmarkIntoFolderToState(state, "a", "f-a");
    expect(next).not.toBe(state);
    expect(next.bookmarks).not.toBe(state.bookmarks);
    expect(state.bookmarks.find((x) => x.id === "a")?.folder).toBeNull();
  });
});

describe("applyUndoBookmarkIntoFolderToState", () => {
  it("restores a non-null prevFolder on the moved bookmark", () => {
    const state = stateWith([bm({ id: "a", folder: "f-old" })]);
    const next = applyBookmarkIntoFolderToState(state, "a", "f-new");
    const back = applyUndoBookmarkIntoFolderToState(next, "a", "f-old");
    expect(back.bookmarks.find((x) => x.id === "a")?.folder).toBe("f-old");
  });

  it("restores a null prevFolder (was standalone before the move)", () => {
    const state = stateWith([bm({ id: "a", folder: null })]);
    const next = applyBookmarkIntoFolderToState(state, "a", "f-new");
    const back = applyUndoBookmarkIntoFolderToState(next, "a", null);
    expect(back.bookmarks.find((x) => x.id === "a")?.folder).toBeNull();
  });

  it("round-trips bookmarkIntoFolder ↔ undoBookmarkIntoFolder with null prev", () => {
    const state = stateWith([bm({ id: "a", folder: null })]);
    const moved = applyBookmarkIntoFolderToState(state, "a", "f-new");
    const reverted = applyUndoBookmarkIntoFolderToState(moved, "a", null);
    expect(reverted.bookmarks).toEqual(state.bookmarks);
  });

  it("is a no-op on a missing bookmark id (returns next, content unchanged)", () => {
    const state = stateWith([bm({ id: "a", folder: "f-a" })]);
    const next = applyUndoBookmarkIntoFolderToState(state, "ghost", "f-old");
    expect(next.bookmarks).toEqual(state.bookmarks);
    expect(next).not.toBe(state);
  });

  it("leaves unrelated bookmarks' folder FKs untouched", () => {
    const state = stateWith([
      bm({ id: "a", folder: "f-old" }),
      bm({ id: "c", folder: "f-b" }),
    ]);
    const next = applyBookmarkIntoFolderToState(state, "a", "f-new");
    const back = applyUndoBookmarkIntoFolderToState(next, "a", "f-old");
    expect(back.bookmarks.find((x) => x.id === "c")?.folder).toBe("f-b");
  });
});

// ------------------------------------------------------------------
// findBookmark / findFolder
// ------------------------------------------------------------------

describe("findBookmark / findFolder", () => {
  it("findBookmark returns the bookmark or undefined", () => {
    const state = stateWith([
      bm({ id: "a", folder: "f-a" }),
      bm({ id: "b", folder: null }),
    ]);
    expect(findBookmark(state, "a")?.id).toBe("a");
    expect(findBookmark(state, "ghost")).toBeUndefined();
  });

  it("findFolder returns the folder or undefined", () => {
    const state = stateWith([bm()]);
    expect(findFolder(state, "f-a")?.id).toBe("f-a");
    expect(findFolder(state, "ghost")).toBeUndefined();
  });
});

// ------------------------------------------------------------------
// applyCollapseSoloFoldersToState
// ------------------------------------------------------------------

// `stateWith()` always seeds two empty folders; collapse tests want to
// assert on a specific folder layout, so build the state inline.
function foldersOnly(folders: { id: string; name: string; category: "home" }[]): HomeState {
  return { ...initialState, bookmarks: [], folders };
}

describe("applyCollapseSoloFoldersToState", () => {
  it("collapses a folder with N=1: member becomes standalone, folder removed", () => {
    const state: HomeState = {
      ...foldersOnly([{ id: "f-a", name: "A", category: "home" }]),
      bookmarks: [
        bm({ id: "a", folder: "f-a" }),
        bm({ id: "b", folder: null }),
      ],
    };
    const next = applyCollapseSoloFoldersToState(state);
    expect(next.folders).toHaveLength(0);
    expect(next.bookmarks.find((x) => x.id === "a")?.folder).toBeNull();
  });

  it("collapses an empty folder (N=0): folder removed, no bookmarks touched", () => {
    const state: HomeState = {
      ...foldersOnly([{ id: "f-a", name: "A", category: "home" }]),
      bookmarks: [bm({ id: "a", folder: null })],
    };
    const next = applyCollapseSoloFoldersToState(state);
    expect(next.folders).toHaveLength(0);
    expect(next.bookmarks).toEqual(state.bookmarks);
  });

  it("leaves a folder with N=2 alone", () => {
    const state: HomeState = {
      ...foldersOnly([{ id: "f-a", name: "A", category: "home" }]),
      bookmarks: [
        bm({ id: "a", folder: "f-a" }),
        bm({ id: "b", folder: "f-a" }),
        bm({ id: "c", folder: null }),
      ],
    };
    const next = applyCollapseSoloFoldersToState(state);
    expect(next.folders).toHaveLength(1);
    expect(next.bookmarks.find((x) => x.id === "a")?.folder).toBe("f-a");
    expect(next.bookmarks.find((x) => x.id === "b")?.folder).toBe("f-a");
  });

  it("leaves a 16-member folder alone", () => {
    const big = Array.from({ length: 16 }, (_, i) =>
      bm({ id: `m${i}`, folder: "f-a" }),
    );
    const state: HomeState = {
      ...foldersOnly([{ id: "f-a", name: "A", category: "home" }]),
      bookmarks: [...big, bm({ id: "loose", folder: null })],
    };
    const next = applyCollapseSoloFoldersToState(state);
    expect(next.folders).toHaveLength(1);
    expect(next.bookmarks.filter((x) => x.folder === "f-a")).toHaveLength(16);
  });

  it("collapses only the qualifying folder when state mixes N≤1 and N>1", () => {
    const state: HomeState = {
      ...foldersOnly([
        { id: "f-a", name: "A", category: "home" },
        { id: "f-b", name: "B", category: "home" },
      ]),
      bookmarks: [
        bm({ id: "a", folder: "f-a" }), // f-a: N=1 → collapses
        bm({ id: "b", folder: "f-b" }),
        bm({ id: "c", folder: "f-b" }), // f-b: N=2 → stays
      ],
    };
    const next = applyCollapseSoloFoldersToState(state);
    expect(next.folders.map((f) => f.id)).toEqual(["f-b"]);
    expect(next.bookmarks.find((x) => x.id === "a")?.folder).toBeNull();
    expect(next.bookmarks.find((x) => x.id === "b")?.folder).toBe("f-b");
    expect(next.bookmarks.find((x) => x.id === "c")?.folder).toBe("f-b");
  });

  it("leaves standalone (folder: null) bookmarks untouched", () => {
    const state: HomeState = {
      ...foldersOnly([{ id: "f-a", name: "A", category: "home" }]),
      bookmarks: [
        bm({ id: "a", folder: "f-a" }), // f-a: N=1 → collapses
        bm({ id: "b", folder: null }),
        bm({ id: "c", folder: null }),
      ],
    };
    const next = applyCollapseSoloFoldersToState(state);
    expect(next.folders).toHaveLength(0);
    expect(next.bookmarks.find((x) => x.id === "b")?.folder).toBeNull();
    expect(next.bookmarks.find((x) => x.id === "c")?.folder).toBeNull();
  });

  it("no folders present → identity (same state reference)", () => {
    const state: HomeState = { ...initialState, bookmarks: [], folders: [] };
    expect(applyCollapseSoloFoldersToState(state)).toBe(state);
  });

  it("collapses the home 'entertainment' folder at N=1 (no special-case)", () => {
    const state: HomeState = {
      ...initialState,
      bookmarks: [bm({ id: "a", folder: "entertainment", category: "home" })],
      folders: [{ id: "entertainment", name: "娱乐", category: "home" }],
    };
    const next = applyCollapseSoloFoldersToState(state);
    expect(next.folders).toHaveLength(0);
    expect(next.bookmarks[0].folder).toBeNull();
  });
});

// ------------------------------------------------------------------
// applyPruneDanglingBookmarkFKs
// ------------------------------------------------------------------

describe("applyPruneDanglingBookmarkFKs", () => {
  it("nulls a bookmark whose folder id is missing from state.folders", () => {
    const state = stateWith([
      bm({ id: "a", folder: "ghost-folder" }),
      bm({ id: "b", folder: null }),
    ]);
    const next = applyPruneDanglingBookmarkFKs(state);
    expect(next.bookmarks.find((x) => x.id === "a")?.folder).toBeNull();
  });

  it("leaves a bookmark pointing to an existing folder alone", () => {
    const state = stateWith([
      bm({ id: "a", folder: "f-a" }),
      bm({ id: "b", folder: null }),
    ]);
    expect(applyPruneDanglingBookmarkFKs(state)).toBe(state);
  });

  it("leaves a standalone (folder: null) bookmark alone", () => {
    const state = stateWith([bm({ id: "a", folder: null })]);
    expect(applyPruneDanglingBookmarkFKs(state)).toBe(state);
  });

  it("no dangling FKs → identity (same state reference)", () => {
    const state = stateWith([
      bm({ id: "a", folder: "f-a" }),
      bm({ id: "b", folder: "f-b" }),
    ]);
    expect(applyPruneDanglingBookmarkFKs(state)).toBe(state);
  });
});
