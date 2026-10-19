import type { Bookmark, CategoryId, Folder, HomeState } from "./home-data";

/**
 * Pure state transforms for the folder / DnD / merge flow.
 *
 * Every function in this module is a \`(HomeState, ...) -> HomeState\`:
 * no I/O, no React state, no toast calls, no Date.now(). The page-level
 * wrappers in `app/page.tsx` compose these with `setData` + sonner
 * `toast` for the side-effect variant; here we keep the logic testable
 * with plain `expect(transform(input)).toEqual(expectedOutput)` pairs.
 *
 * Why a dedicated module:
 *  - these functions embody HiTab's only DnD UX (merge / ungroup / remove
 *    / rename); a regression would silently break the headline feature
 *  - while they lived inline in `app/page.tsx` they were unreachable to
 *    unit tests
 *  - they are pure, so they can be reused from SSR, sync layers, or any
 *    future surface (e.g. an undo redo server endpoint) without dragging
 *    React along
 */

// ------------------------------------------------------------------
// Merge / ungroup / remove / rename transforms
// ------------------------------------------------------------------

/** Move both source and target into `folderId`. Leaves every other
 *  bookmark intact (other group/folder references untouched). */
export function applyMergeToState(
  state: HomeState,
  sourceId: string,
  targetId: string,
  folderId: string,
): HomeState {
  return {
    ...state,
    bookmarks: state.bookmarks.map((b) =>
      b.id === sourceId || b.id === targetId
        ? { ...b, folder: folderId }
        : b,
    ),
  };
}

/** Reverse of \`applyMergeToState\`. Uses the snapshots returned by
 *  \`snapshotMergeUndo\`. The \`folders\` array is restored wholesale so
 *  brand-new folders created during the merge also disappear on undo. */
export function applyUndoMergeToState(
  state: HomeState,
  sourceId: string,
  targetId: string,
  prevSourceFolder: string | null,
  prevTargetFolder: string | null,
  prevFolders: Folder[],
): HomeState {
  return {
    ...state,
    bookmarks: state.bookmarks.map((b) => {
      if (b.id === sourceId) return { ...b, folder: prevSourceFolder };
      if (b.id === targetId) return { ...b, folder: prevTargetFolder };
      return b;
    }),
    folders: prevFolders,
  };
}

/** Move a single bookmark into `folderId`. No-op if the id is unknown —
 *  state stays referentially new (returns next) so undo replays safely and
 *  unrelated callers can `===` against the previous object identity. */
export function applyBookmarkIntoFolderToState(
  state: HomeState,
  bookmarkId: string,
  folderId: string,
): HomeState {
  return {
    ...state,
    bookmarks: state.bookmarks.map((b) =>
      b.id === bookmarkId ? { ...b, folder: folderId } : b,
    ),
  };
}

/** Reverse `applyBookmarkIntoFolderToState` using `prevFolder` snapshotted
 *  at drop time (concurrent edits could shift the source FK in between).
 *  `prevFolder === null` is the "was standalone" case — we faithfully
 *  restore it instead of coercing to `""`. */
export function applyUndoBookmarkIntoFolderToState(
  state: HomeState,
  bookmarkId: string,
  prevFolder: string | null,
): HomeState {
  return {
    ...state,
    bookmarks: state.bookmarks.map((b) =>
      b.id === bookmarkId ? { ...b, folder: prevFolder } : b,
    ),
  };
}

/** Drop a single bookmark out of its folder (sets folder FK to null). */
export function applyUngroupToState(
  state: HomeState,
  bookmarkId: string,
): HomeState {
  return {
    ...state,
    bookmarks: state.bookmarks.map((b) =>
      b.id === bookmarkId ? { ...b, folder: null } : b,
    ),
  };
}

/** Reverse of \`applyUngroupToState\` for a freshly-ungrouped bookmark. */
export function applyUndoUngroupToState(
  state: HomeState,
  bookmarkId: string,
  prevFolder: string | null,
): HomeState {
  return {
    ...state,
    bookmarks: state.bookmarks.map((b) =>
      b.id === bookmarkId ? { ...b, folder: prevFolder } : b,
    ),
  };
}

/** Remove a folder row AND null every member's FK to it. The
 *  nulling matters: dangling folder references would block
 *  creating a new folder with the same id later. */
export function applyRemoveFolderToState(
  state: HomeState,
  folderId: string,
): HomeState {
  return {
    ...state,
    folders: state.folders.filter((f) => f.id !== folderId),
    bookmarks: state.bookmarks.map((b) =>
      b.folder === folderId ? { ...b, folder: null } : b,
    ),
  };
}

/** Rename a folder. Trims whitespace and clamps to 20 chars (matching
 *  the Folder schema's `name.z.string().min(1).max(20)`). Empty name is
 *  a no-op so the caller doesn't have to pre-validate. */
export function applyRenameFolderToState(
  state: HomeState,
  folderId: string,
  name: string,
): HomeState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const final = trimmed.slice(0, 20);
  return {
    ...state,
    folders: state.folders.map((f) =>
      f.id === folderId ? { ...f, name: final } : f,
    ),
  };
}

/** Append a brand-new folder row (used by the merge dialog's "新建分组" branch). */
export function applyNewFolderToState(
  state: HomeState,
  folder: Folder,
): HomeState {
  return {
    ...state,
    folders: [...state.folders, folder],
  };
}

// ------------------------------------------------------------------
// Snapshot helpers — pure, but return data instead of state.
// ------------------------------------------------------------------

export interface MergeUndoSnapshot {
  sourcePrev: string | null;
  targetPrev: string | null;
  prevFolders: Folder[];
}

/** Capture everything \`applyUndoMergeToState\` needs to roll back a merge. */
export function snapshotMergeUndo(
  state: HomeState,
  sourceId: string,
  targetId: string,
): MergeUndoSnapshot {
  return {
    sourcePrev:
      state.bookmarks.find((b) => b.id === sourceId)?.folder ?? null,
    targetPrev:
      state.bookmarks.find((b) => b.id === targetId)?.folder ?? null,
    prevFolders: state.folders,
  };
}

/** Convenience constructor used by the merge dialog "新建分组" path
 *  where there is no pre-existing folder FK on the source/target. */
export function makeFolder(
  id: string,
  name: string,
  category: CategoryId,
): Folder {
  return { id, name, category };
}

/** Read a bookmark by id with the right typing for callers. */
export function findBookmark(
  state: HomeState,
  id: string,
): Bookmark | undefined {
  return state.bookmarks.find((b) => b.id === id);
}

/** Read a folder by id. */
export function findFolder(
  state: HomeState,
  id: string,
): Folder | undefined {
  return state.folders.find((f) => f.id === id);
}
