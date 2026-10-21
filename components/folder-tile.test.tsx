import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderTile, type FolderTileProps } from "@/components/folder-tile";
import type { Bookmark, Folder } from "@/lib/home-data";

// jsdom doesn't ship these — Radix DropdownMenu depends on them at mount.
beforeEach(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
  }
  if (!("matchMedia" in globalThis)) {
    Object.defineProperty(globalThis, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  if (!("scrollIntoView" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      writable: true,
      value: () => {},
    });
  }
});

afterEach(() => {
  cleanup();
});

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------

const folder: Folder = { id: "f1", name: "工作", category: "code" };

function bm(id: string, name: string): Bookmark {
  return {
    id,
    name,
    icon: "",
    url: `https://${id}.example.com`,
    category: "code",
    folder: folder.id,
  };
}

/** Every callback stubbed; individual tests override what they assert on. */
function setup(overrides: Partial<FolderTileProps> = {}) {
  const props: FolderTileProps = {
    folder,
    members: [bm("github", "GitHub"), bm("gitlab", "GitLab")],
    isDropTarget: false,
    onOpen: vi.fn(),
    onRemoveFolder: vi.fn(),
    onDragStartMember: vi.fn(),
    onDragEndMember: vi.fn(),
    onDragOverFolder: vi.fn(),
    onDragLeave: vi.fn(),
    onDropOnFolder: vi.fn(),
    ...overrides,
  };
  const view = render(<FolderTile {...props} />);
  return {
    ...view,
    props,
    card: view.container.querySelector(".folder-card") as HTMLElement,
  };
}

// ------------------------------------------------------------------
// The bug: a cover icon inside a folder tile must open its own bookmark
// ------------------------------------------------------------------

describe("FolderTile — cover icons are links", () => {
  it("renders each member as a new-tab link", () => {
    setup();
    const link = screen.getByRole("link", { name: "打开GitHub" });
    expect(link).toHaveAttribute("href", "https://github.example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "打开GitLab" })).toBeInTheDocument();
  });

  it("opens the bookmark instead of the folder panel on click", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("link", { name: "打开GitHub" }));
    // The regression this file exists for: the click must not bubble up to
    // the card's own onClick, which pops the folder manager panel.
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("links the mini icons inside a stack cell too", async () => {
    const user = userEvent.setup();
    // N=7 → three single cells plus a 4-up stack cell (see layoutMembers).
    const members = Array.from({ length: 7 }, (_, i) => bm(`m${i}`, `成员${i}`));
    const { container, props } = setup({ members });

    const cells = container.querySelectorAll(".folder-icon-stack-cell");
    expect(cells).toHaveLength(4);
    for (const cell of cells) expect(cell.tagName).toBe("A");

    await user.click(screen.getByRole("link", { name: "打开成员3" }));
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("keeps cover icons draggable so members can be dragged back out", () => {
    const { props } = setup();
    const link = screen.getByRole("link", { name: "打开GitHub" });
    expect(link).toHaveAttribute("draggable", "true");

    // The component only forwards; page.tsx owns the dataTransfer writes.
    fireEvent.dragStart(link, { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });
    expect(props.onDragStartMember).toHaveBeenCalledWith(
      "github",
      expect.anything(),
    );

    fireEvent.dragEnd(link);
    expect(props.onDragEndMember).toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------
// Opening the folder stays reachable from the card, the name and the menu
// ------------------------------------------------------------------

describe("FolderTile — opening the folder", () => {
  it("opens the folder when the card's empty area is clicked", async () => {
    const user = userEvent.setup();
    const { card, props } = setup();
    await user.click(card);
    expect(props.onOpen).toHaveBeenCalledWith(folder.id);
  });

  it("opens the folder from the name label (keyboard reachable)", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    const name = screen.getByRole("button", { name: "打开工作分组" });
    expect(name).toHaveTextContent("工作");

    await user.click(name);
    expect(props.onOpen).toHaveBeenCalledWith(folder.id);
  });

  it("treats an empty folder's placeholder as card space, not a link", async () => {
    const user = userEvent.setup();
    const { container, props } = setup({ members: [] });
    const placeholder = container.querySelector(".folder-icon") as HTMLElement;
    expect(placeholder.tagName).toBe("DIV");
    expect(container.querySelectorAll("a")).toHaveLength(0);

    await user.click(placeholder);
    expect(props.onOpen).toHaveBeenCalledWith(folder.id);
  });

  it("exposes 打开分组 / 删除分组 through the ⋯ menu", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "管理工作分组" }));

    await user.click(await screen.findByRole("menuitem", { name: "打开分组" }));
    expect(props.onOpen).toHaveBeenCalledWith(folder.id);

    await user.click(screen.getByRole("button", { name: "管理工作分组" }));
    await user.click(await screen.findByRole("menuitem", { name: "删除分组" }));
    expect(props.onRemoveFolder).toHaveBeenCalledWith(folder.id);
  });
});

// ------------------------------------------------------------------
// Box shape follows the member count
// ------------------------------------------------------------------

describe("FolderTile — box shape", () => {
  it("spans one grid cell for a single-member folder", () => {
    const { container } = setup({ members: [bm("github", "GitHub")] });
    expect(container.querySelector(".tile")).toHaveStyle({
      gridColumn: "span 1",
      gridRow: "span 1",
    });
  });

  it("spans a 2×2 square once there are two or more members", () => {
    const { container } = setup();
    expect(container.querySelector(".tile")).toHaveStyle({
      gridColumn: "span 2",
      gridRow: "span 2",
    });
  });

  it("marks the tile as a drop target when a drag hovers it", () => {
    const { container } = setup({ isDropTarget: true });
    expect(container.querySelector(".tile")?.className).toContain("drop-target");
  });
});