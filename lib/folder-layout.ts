import type { Bookmark } from "./home-data";

/**
 * One cell of a 2×2 folder layout. A "single" cell shows one full-size icon
 * (the typical case when the folder has few members). A "stack" cell shows
 * up to four mini icons in a 2×2 sub-grid (used once the folder overflows
 * past the 4-cell normal limit).
 */
export type FolderCellSlot =
  | { kind: "single"; bookmark: Bookmark | null }
  | { kind: "stack"; bookmarks: Bookmark[]; overflow: number };

/**
 * A folder's full layout as four physical cells, ordered:
 *   cells[0] = top-left      (1,1)
 *   cells[1] = top-right     (1,2)
 *   cells[2] = bottom-left   (2,1)
 *   cells[3] = bottom-right  (2,2)
 * The 2×2 layout is shared between the home entertainment widget and the
 * category-grid folder tile so they always look consistent.
 */
export interface FolderLayout {
  cells: [
    FolderCellSlot,
    FolderCellSlot,
    FolderCellSlot,
    FolderCellSlot,
  ];
}

const MAX_VISIBLE = 16;
const STACK_CAP = 4;

/**
 * Decide which members of `members` go into which cell. Implements the
 * spec:
 *   - 1 member  → (1,1) only
 *   - 2         → (1,1)(1,2)
 *   - 3-4       → 2×2 all single
 *   - 5-7       → TL/TR/BL single, BR packs members 4..N
 *   - 8-10      → TL/TR single, BL+BR pack
 *   - 11-13     → TL single, TR/BL/BR pack
 *   - 14-16     → all four cells pack
 *   - >16       → visible 16 + overflow badge on the last stack
 */
export function layoutMembers(members: Bookmark[]): FolderLayout {
  const totalCount = members.length;
  const overflow = Math.max(0, totalCount - MAX_VISIBLE);
  const visible = members.slice(0, MAX_VISIBLE);
  const totalShown = visible.length;

  const emptySingle = (): FolderCellSlot => ({
    kind: "single",
    bookmark: null,
  });

  const idxRef = { i: 0 };
  // Pull next 1..STACK_CAP members as a stack; the caller decides which
  // cell to drop them in (so we keep the layout decision in one place).
  const takeStack = (): FolderCellSlot => {
    const chunk = visible.slice(idxRef.i, idxRef.i + STACK_CAP);
    idxRef.i += chunk.length;
    return { kind: "stack", bookmarks: chunk, overflow: 0 };
  };
  const takeSingle = (): FolderCellSlot => {
    const m = visible[idxRef.i++] ?? null;
    return { kind: "single", bookmark: m };
  };

  let cells: FolderCellSlot[];
  if (totalShown <= 0) {
    cells = [emptySingle(), emptySingle(), emptySingle(), emptySingle()];
  } else if (totalShown <= 4) {
    cells = [takeSingle(), takeSingle(), takeSingle(), takeSingle()];
  } else if (totalShown <= 7) {
    cells = [takeSingle(), takeSingle(), takeSingle(), takeStack()];
  } else if (totalShown <= 10) {
    cells = [takeSingle(), takeSingle(), takeStack(), takeStack()];
  } else if (totalShown <= 13) {
    cells = [takeSingle(), takeStack(), takeStack(), takeStack()];
  } else {
    cells = [takeStack(), takeStack(), takeStack(), takeStack()];
  }

  // Attach the overflow badge to the last stack cell so a folder with
  // >16 members clearly shows "more available".
  if (overflow > 0) {
    const lastStack = [...cells].reverse().find((c) => c.kind === "stack");
    if (lastStack && lastStack.kind === "stack") {
      lastStack.overflow = overflow;
    }
  }

  return { cells: cells as FolderLayout["cells"] };
}
