import type { Bookmark, HomeState } from "./home-data";

/**
 * Pure state transforms for the bookmark edit / DnD reorder flow.
 *
 * Every function is `(HomeState, ...) -> HomeState` — no I/O, no
 * zod, no toast. Mirrors `lib/folder-actions.ts` so the page-level
 * UI can compose these with React state setters / sonner and stay
 * trivial, and so unit tests cover the actual logic with plain
 * input/output pairs.
 *
 * Specifically NOT here (kept in `app/page.tsx` because they involve
 * form-side concerns):
 *  - zod schema validation (`bookmarkSchema.safeParse`) — already
 *    covered indirectly by `lib/home-data.test.ts`.
 *  - toast orchestration on undo — a thin wrapper around the
 *    corresponding `applyXxxToState` + `applyUndoXxxToState` pair.
 */

// ------------------------------------------------------------------
// Append / update
// ------------------------------------------------------------------

/** Append a freshly-validated bookmark to the end of `bookmarks`. */
export function applyAppendBookmarkToState(
  state: HomeState,
  bookmark: Bookmark,
): HomeState {
  return { ...state, bookmarks: [...state.bookmarks, bookmark] };
}

/** Replace one bookmark (matched by id) with a new payload. */
export function applyUpdateBookmarkToState(
  state: HomeState,
  id: string,
  next: Bookmark,
): HomeState {
  return {
    ...state,
    bookmarks: state.bookmarks.map((b) => (b.id === id ? next : b)),
  };
}

// ------------------------------------------------------------------
// Remove (+ undo)
// ------------------------------------------------------------------

/** Filter out the bookmark with the given id. */
export function applyRemoveBookmarkToState(
  state: HomeState,
  id: string,
): HomeState {
  return {
    ...state,
    bookmarks: state.bookmarks.filter((b) => b.id !== id),
  };
}

/**
 * Splice the bookmark back in at `index`. The caller must capture the
 * original index at remove-time (linearly scanning state.bookmarks at
 * undo time is unreliable — concurrent edits could shift the index).
 */
export function applyUndoRemoveBookmarkToState(
  state: HomeState,
  bookmark: Bookmark,
  index: number,
): HomeState {
  // If a concurrent edit re-created the same id, don't double-insert.
  if (state.bookmarks.some((b) => b.id === bookmark.id)) return state;
  const next = [...state.bookmarks];
  // Clamp the index to the current bounds (in case other inserts/remove
  // shifted the list while the toast was pending).
  const safe = Math.max(0, Math.min(index, next.length));
  next.splice(safe, 0, bookmark);
  return { ...state, bookmarks: next };
}

// ------------------------------------------------------------------
// Reorder (drag-drop / context-menu move)
// ------------------------------------------------------------------

/**
 * Move `from` to the position currently occupied by `to`. Idempotent on
 * a no-op (`from === to`). Returns the input state unchanged if either
 * id is missing (no schema-violating crash).
 */
export function applyReorderToState(
  state: HomeState,
  fromId: string,
  toId: string,
): HomeState {
  if (fromId === toId) return state;
  const a = state.bookmarks.findIndex((b) => b.id === fromId);
  const b = state.bookmarks.findIndex((b) => b.id === toId);
  if (a < 0 || b < 0) return state;
  const next = [...state.bookmarks];
  const [item] = next.splice(a, 1);
  next.splice(b, 0, item);
  return { ...state, bookmarks: next };
}
