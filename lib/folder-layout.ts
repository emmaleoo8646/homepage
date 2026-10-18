import type { Bookmark } from "./home-data";

/**
 * One cell of a folder layout. A "single" cell shows one full-size icon
 * (the typical case when the folder has few members). A "stack" cell shows
 * up to four mini icons in a 2×2 sub-grid (used once the folder overflows
 * past the 4-cell normal limit). Empty cells (no member, no Plus) are not
 * represented at all — the grid just leaves the slot blank.
 */
export type FolderCellSlot =
  | { kind: "single"; bookmark: Bookmark | null }
  | { kind: "stack"; bookmarks: Bookmark[]; overflow: number };

/**
 * Shape of the box, in CSS-grid terms.
 *   - 1x1: a single square (used for N=0 "empty folder" + N=1)
 *   - 1x2: a single row of 2 cells (N=2)
 *   - 2x2: the canonical 2×2 block (N=3+, with up to 4 cells + stacks)
 */
export type LayoutMode = "1x1" | "1x2" | "2x2";

export interface FolderLayout {
  mode: LayoutMode;
  /** Up to 4 populated cells. Empty slots are NOT rendered as `+`. */
  cells: FolderCellSlot[];
}

const MAX_VISIBLE = 16;
const STACK_CAP = 4;

/**
 * Decide which members of `members` go into which cell, and the overall
 * box shape. Always renders exactly as many cells as there are content
 * slots — empty placeholders are intentionally omitted so the user never
 * sees a stray `+` icon next to real bookmarks.
 *
 *   - 1  → 1×1 single
 *   - 2  → 1×2 (single row, no empty cells)
 *   - 3  → 2×2 with three cells filled; cell (2,2) is naturally blank
 *   - 4  → 2×2 four singles
 *   - 5-7   → TL/TR/BL single, BR stacks members 4..N
 *   - 8-10  → TL/TR single, BL/BR stack
 *   - 11-13 → TL single, TR/BL/BR stack
 *   - 14-16 → all four cells are stacks
 *   - >16   → same as 14-16, last stack carries a `+N` badge
 */
export function layoutMembers(members: Bookmark[]): FolderLayout {
  const totalCount = members.length;
  const overflow = Math.max(0, totalCount - MAX_VISIBLE);
  const visible = members.slice(0, MAX_VISIBLE);
  const totalShown = visible.length;

  const idx = { i: 0 };
  const takeSingle = (): FolderCellSlot => {
    const m = visible[idx.i++] ?? null;
    return { kind: "single", bookmark: m };
  };
  const takeStack = (cap = STACK_CAP): FolderCellSlot => {
    const chunk = visible.slice(idx.i, idx.i + cap);
    idx.i += chunk.length;
    return { kind: "stack", bookmarks: chunk, overflow: 0 };
  };
  const takeEmptyPlus = (): FolderCellSlot => ({
    kind: "single",
    bookmark: null,
  });

  let mode: LayoutMode;
  let cells: FolderCellSlot[];
  if (totalShown <= 0) {
    mode = "1x1";
    cells = [takeEmptyPlus()];
  } else if (totalShown === 1) {
    mode = "1x1";
    cells = [takeSingle()];
  } else if (totalShown === 2) {
    mode = "1x2";
    cells = [takeSingle(), takeSingle()];
  } else if (totalShown === 3) {
    mode = "2x2";
    cells = [takeSingle(), takeSingle(), takeSingle()];
  } else if (totalShown === 4) {
    mode = "2x2";
    cells = [takeSingle(), takeSingle(), takeSingle(), takeSingle()];
  } else if (totalShown <= 7) {
    mode = "2x2";
    cells = [takeSingle(), takeSingle(), takeSingle(), takeStack(4)];
  } else if (totalShown <= 10) {
    mode = "2x2";
    cells = [takeSingle(), takeSingle(), takeStack(4), takeStack(4)];
  } else if (totalShown <= 13) {
    mode = "2x2";
    cells = [takeSingle(), takeStack(4), takeStack(4), takeStack(4)];
  } else {
    mode = "2x2";
    cells = [takeStack(4), takeStack(4), takeStack(4), takeStack(4)];
  }

  // Attach the overflow badge to the last stack cell so a folder with
  // >16 members clearly shows "+N more".
  if (overflow > 0) {
    const lastStack = [...cells].reverse().find((c) => c.kind === "stack");
    if (lastStack && lastStack.kind === "stack") {
      lastStack.overflow = overflow;
    }
  }

  return { mode, cells };
}
