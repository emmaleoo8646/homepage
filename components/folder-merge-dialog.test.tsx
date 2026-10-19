import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  FolderMergeDialog,
  type MergeDraft,
} from "@/components/folder-merge-dialog";
import type { Bookmark, Folder } from "@/lib/home-data";

// jsdom doesn't ship these — Radix Dialog depends on them at mount.
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
// Test fixtures
// ------------------------------------------------------------------

function bm(id: string, name: string, folder: string | null = null): Bookmark {
  return {
    id,
    name,
    icon: "",
    url: `https://example.com/${id}`,
    category: "home",
    folder,
  };
}

function folder(id: string, name: string): Folder {
  return { id, name, category: "home" };
}

function makeDraft(
  overrides: Partial<MergeDraft> = {},
): MergeDraft {
  return {
    source: bm("source-1", "Source"),
    target: bm("target-1", "Target"),
    targetFolder: null,
    category: "home",
    ...overrides,
  };
}

function setup(props: {
  draft?: MergeDraft | null;
  onConfirm?: ReturnType<typeof vi.fn>;
  onOpenChange?: ReturnType<typeof vi.fn>;
  open?: boolean;
}) {
  const onConfirm = props.onConfirm ?? vi.fn();
  const onOpenChange = props.onOpenChange ?? vi.fn();
  render(
    <FolderMergeDialog
      open={props.open ?? true}
      onOpenChange={onOpenChange}
      draft={props.draft ?? null}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onOpenChange };
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("FolderMergeDialog — render gating", () => {
  it("returns null when draft is null (no DOM output at all)", () => {
    const { container } = render(
      <FolderMergeDialog
        open={true}
        onOpenChange={() => {}}
        draft={null}
        onConfirm={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("returns null when closed and draft is null", () => {
    const { container } = render(
      <FolderMergeDialog
        open={false}
        onOpenChange={() => {}}
        draft={null}
        onConfirm={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FolderMergeDialog — same-folder noop branch", () => {
  it("renders the '已在同一分组' dialog when source.folder === target.folder (same folder id)", () => {
    setup({
      draft: makeDraft({
        source: bm("a", "A", "f1"),
        target: bm("b", "B", "f1"),
        targetFolder: folder("f1", "我的收藏"),
      }),
    });
    expect(screen.getByText("已在同一分组")).toBeInTheDocument();
    expect(
      screen.getByText(/这两个网址已在「我的收藏」中/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "知道了" })).toBeInTheDocument();
    // No form controls in this branch.
    expect(screen.queryByLabelText("分组名")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "新建分组" })).not.toBeInTheDocument();
  });

  it("falls back to the shared folder id when targetFolder is missing", () => {
    setup({
      draft: makeDraft({
        source: bm("a", "A", "shared-folder-id"),
        target: bm("b", "B", "shared-folder-id"),
        targetFolder: null,
      }),
    });
    expect(screen.getByText("已在同一分组")).toBeInTheDocument();
    expect(
      screen.getByText(/这两个网址已在「shared-folder-id」中/),
    ).toBeInTheDocument();
  });

  it("'知道了' button calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    setup({
      draft: makeDraft({
        source: bm("a", "A", "f1"),
        target: bm("b", "B", "f1"),
        targetFolder: folder("f1", "F"),
      }),
      onOpenChange,
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("FolderMergeDialog — standard merge flow", () => {
  it("renders both source and target preview chips with names", () => {
    setup({
      draft: makeDraft({
        source: bm("a", "花瓣", null),
        target: bm("b", "站酷", null),
      }),
    });
    expect(screen.getByText("花瓣")).toBeInTheDocument();
    expect(screen.getByText("站酷")).toBeInTheDocument();
  });

  it("without a target folder: only the '新建分组' radio is offered", () => {
    setup({
      draft: makeDraft({ targetFolder: null }),
    });
    expect(screen.getByRole("radio", { name: "新建分组" })).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /合并到「/ }),
    ).not.toBeInTheDocument();
  });

  it("with a target folder: both radios are offered, default is 'join'", () => {
    setup({
      draft: makeDraft({
        targetFolder: folder("f1", "灵感"),
      }),
    });
    expect(screen.getByRole("radio", { name: "新建分组" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "合并到「灵感」" }),
    ).toBeInTheDocument();
    // Default mode: 'join' (per state init), so the join radio is the
    // initially-checked one.
    expect(
      screen.getByRole("radio", { name: "合并到「灵感」" }),
    ).toBeChecked();
  });

  it("the 分组名 input is shown only in 'new' mode", async () => {
    const user = userEvent.setup();
    setup({
      draft: makeDraft({ targetFolder: folder("f1", "灵感") }),
    });
    // Default 'join' mode → no input visible yet.
    expect(screen.queryByLabelText("分组名")).not.toBeInTheDocument();
    // Switch to 'new' → input appears.
    await user.click(screen.getByRole("radio", { name: "新建分组" }));
    expect(screen.getByLabelText("分组名")).toBeInTheDocument();
    // Switch back → input disappears.
    await user.click(screen.getByRole("radio", { name: "合并到「灵感」" }));
    expect(screen.queryByLabelText("分组名")).not.toBeInTheDocument();
  });

  it("确认 with 'new' calls onConfirm with the trimmed name", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    setup({
      onConfirm,
      draft: makeDraft({ targetFolder: folder("f1", "灵感") }),
    });
    // With targetFolder set, default mode is 'join'. Switch to 'new' so
    // the input becomes visible. The component intentionally pre-fills
    // the input with the target folder's name to streamline renaming;
    // typing into the input replaces the value.
    await user.click(screen.getByRole("radio", { name: "新建分组" }));
    const input = screen.getByLabelText("分组名") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, " 灵感素材 ");
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      mode: "new",
      name: "灵感素材",
    });
  });

  it("确认 with 'join' calls onConfirm with the target folder id", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    setup({
      onConfirm,
      draft: makeDraft({ targetFolder: folder("f1", "灵感") }),
    });
    // Default mode is 'join' since targetFolder is set.
    expect(
      screen.getByRole("radio", { name: "合并到「灵感」" }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      mode: "join",
      folderId: "f1",
    });
  });

  it("确认 button is disabled while 'new' is selected and the name is empty/whitespace", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    setup({
      onConfirm,
      draft: makeDraft(),
    });
    // Default mode is 'new' (no target folder). Default value '新建分组'
    // has length > 0, so it's enabled by default.
    expect(screen.getByRole("button", { name: "确认" })).not.toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "新建分组" }));
    const input = screen.getByLabelText("分组名");
    await user.clear(input);
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    await user.type(input, "X");
    expect(screen.getByRole("button", { name: "确认" })).not.toBeDisabled();
  });

  it("取消 button calls onOpenChange(false) and never invokes onConfirm", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    setup({ onConfirm, onOpenChange, draft: makeDraft() });
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("the X close-button (aria-label='关闭') also closes the dialog", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    setup({ onOpenChange, draft: makeDraft() });
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("maxLength=20 on the input caps the user input", async () => {
    const user = userEvent.setup();
    setup({ draft: makeDraft() });
    await user.click(screen.getByRole("radio", { name: "新建分组" }));
    const input = screen.getByLabelText("分组名") as HTMLInputElement;
    expect(input.maxLength).toBe(20);
  });

  it("the placeholder hints at typical folder naming", () => {
    setup({ draft: makeDraft() });
    const input = screen.getByLabelText("分组名") as HTMLInputElement;
    expect(input.placeholder).toBe("例如：灵感素材");
  });
});
