import { describe, expect, it } from "vitest";
import { layoutMembers, type FolderCellSlot } from "@/lib/folder-layout";
import type { Bookmark } from "@/lib/home-data";

/**
 * `layoutMembers` is the brain of how a folder renders — chosen by `mode`,
 * which also drives the outer box grid placement. Pinning these rules in a
 * test is the cheapest insurance against accidental regressions while we
 * tweak the visual side. The expected behavior is in `lib/folder-layout.ts`
 * JSDoc; tests below just lock it down.
 */

function bm(id: string): Bookmark {
  return {
    id,
    name: id,
    icon: "",
    url: `https://example.com/${id}`,
    category: "home",
    folder: "f",
  };
}

function cellsByKind(layout: { cells: FolderCellSlot[] }) {
  return layout.cells.map((c) => c.kind);
}

describe("layoutMembers — empty folder / single member", () => {
  it("0 members → 1×1 with a Plus placeholder", () => {
    const layout = layoutMembers([]);
    expect(layout.mode).toBe("1x1");
    expect(cellsByKind(layout)).toEqual(["single"]);
    expect(layout.cells[0].kind).toBe("single");
    if (layout.cells[0].kind === "single") {
      expect(layout.cells[0].bookmark).toBeNull();
    }
  });

  it("1 member → 1×1 with the single bookmark", () => {
    const layout = layoutMembers([bm("a")]);
    expect(layout.mode).toBe("1x1");
    expect(cellsByKind(layout)).toEqual(["single"]);
    expect(layout.cells[0].kind).toBe("single");
    if (layout.cells[0].kind === "single") {
      expect(layout.cells[0].bookmark?.id).toBe("a");
    }
  });
});

describe("layoutMembers — small counts", () => {
  it("2 members → 1×2 (no empty placeholders)", () => {
    const layout = layoutMembers([bm("a"), bm("b")]);
    expect(layout.mode).toBe("1x2");
    expect(cellsByKind(layout)).toEqual(["single", "single"]);
    // Critically: no Plus placeholders, no 4-cell grid.
    expect(layout.cells).toHaveLength(2);
  });

  it("3 members → 2×2 with cell (2,2) absent (user spec: \"2×2 but only show 3 cells\")", () => {
    const layout = layoutMembers([bm("a"), bm("b"), bm("c")]);
    expect(layout.mode).toBe("2x2");
    expect(layout.cells).toHaveLength(3);
    expect(cellsByKind(layout)).toEqual(["single", "single", "single"]);
  });

  it("4 members → 2×2 all filled", () => {
    const layout = layoutMembers([bm("a"), bm("b"), bm("c"), bm("d")]);
    expect(layout.mode).toBe("2x2");
    expect(layout.cells).toHaveLength(4);
    expect(cellsByKind(layout)).toEqual(["single", "single", "single", "single"]);
  });
});

describe("layoutMembers — stacking tiers (5+)", () => {
  it("5-7 members → TL/TR/BL single + BR stack", () => {
    for (const n of [5, 6, 7]) {
      const layout = layoutMembers(
        Array.from({ length: n }, (_, i) => bm(`m${i}`)),
      );
      expect(layout.mode, `mode for N=${n}`).toBe("2x2");
      expect(layout.cells).toHaveLength(4);
      expect(layout.cells[3].kind, `BR cell for N=${n}`).toBe("stack");
    }
  });

  it("8-10 members → only TL/TR single, BL/BR stack", () => {
    for (const n of [8, 10]) {
      const layout = layoutMembers(
        Array.from({ length: n }, (_, i) => bm(`m${i}`)),
      );
      expect(layout.mode, `mode for N=${n}`).toBe("2x2");
      expect(layout.cells[2].kind).toBe("stack");
      expect(layout.cells[3].kind).toBe("stack");
    }
  });

  it("11-13 members → only TL single, three stacks", () => {
    const layout = layoutMembers(
      Array.from({ length: 13 }, (_, i) => bm(`m${i}`)),
    );
    expect(layout.mode).toBe("2x2");
    expect(layout.cells[0].kind).toBe("single");
    expect(layout.cells[1].kind).toBe("stack");
    expect(layout.cells[2].kind).toBe("stack");
    expect(layout.cells[3].kind).toBe("stack");
  });

  it("14-16 members → all four cells are stacks", () => {
    const layout = layoutMembers(
      Array.from({ length: 16 }, (_, i) => bm(`m${i}`)),
    );
    expect(layout.mode).toBe("2x2");
    expect(cellsByKind(layout)).toEqual([
      "stack",
      "stack",
      "stack",
      "stack",
    ]);
  });
});

describe("layoutMembers — overflow badge", () => {
  it("caps at 16 visible and stamps the last stack with the overflow count", () => {
    const members = Array.from({ length: 20 }, (_, i) => bm(`m${i}`));
    const layout = layoutMembers(members);
    expect(layout.mode).toBe("2x2");
    // 16 - 3singles would yield a single+three-stacks layout; but 16 is
    // exactly the bucket boundary, so all four cells are stacks. The
    // overflow goes on the last (BR) one.
    expect(layout.cells.every((c) => c.kind === "stack")).toBe(true);
    const lastStack = layout.cells[3];
    expect(lastStack.kind).toBe("stack");
    if (lastStack.kind === "stack") {
      expect(lastStack.overflow).toBe(4);
      // BR specifically carries the remainder after 12 fit in TL/TR/BL.
      expect(lastStack.bookmarks.length).toBeLessThanOrEqual(4);
    }
  });
});
