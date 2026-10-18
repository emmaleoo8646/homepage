"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { Bookmark, Folder, CategoryId } from "@/lib/home-data";

/**
 * Snapshot of the two bookmarks the user is trying to merge and the folder
 * (if any) the target is already in. The Page owns this state; the dialog
 * only renders it.
 */
export type MergeDraft = {
  source: Bookmark;
  target: Bookmark;
  targetFolder: Folder | null;
  category: CategoryId;
};

export type MergeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: MergeDraft | null;
  onConfirm: (
    input:
      | { mode: "new"; name: string }
      | { mode: "join"; folderId: string },
  ) => void;
};

export function FolderMergeDialog({
  open,
  onOpenChange,
  draft,
  onConfirm,
}: MergeDialogProps) {
  const [name, setName] = useState("新建分组");
  const [mode, setMode] = useState<"new" | "join">("new");
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset form fields when the dialog transitions closed → open so each
  // merge starts from defaults derived from the new draft. This is the
  // React-blessed "Adjusting state while rendering" pattern, which avoids
  // the cascading renders of useEffect-based resets.
  if (open && !prevOpen) {
    setPrevOpen(true);
    setMode(draft?.targetFolder ? "join" : "new");
    setName(draft?.targetFolder ? draft.targetFolder.name : "新建分组");
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  if (!draft) return null;

  // No-op guard: both bookmarks already live in the same folder — show a
  // single-button dismiss so the user understands why nothing happened.
  if (draft.source.folder && draft.source.folder === draft.target.folder) {
    const shared = draft.targetFolder ?? {
      id: draft.source.folder,
      name: draft.source.folder,
      category: draft.category,
    };
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="hitab-dialog">
          <div className="modal-header">
            <DialogTitle>已在同一分组</DialogTitle>
            <DialogClose asChild>
              <button className="close-button" aria-label="关闭">
                <X size={20} />
              </button>
            </DialogClose>
          </div>
          <DialogDescription>
            这两个网址已在「{shared.name}」中，无需重复合并。
          </DialogDescription>
          <div className="merge-actions">
            <Button onClick={() => onOpenChange(false)}>知道了</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hitab-dialog">
        <div className="modal-header">
          <DialogTitle>合并到分组</DialogTitle>
          <DialogClose asChild>
            <button className="close-button" aria-label="关闭">
              <X size={20} />
            </button>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          将两个网址合并到一个分组，可新建分组或加入已有分组。
        </DialogDescription>
        <div className="merge-preview">
          <PreviewChip bookmark={draft.source} />
          <span>+</span>
          <PreviewChip bookmark={draft.target} />
        </div>
        <fieldset className="merge-options">
          <label>
            <input
              type="radio"
              name="merge-mode"
              value="new"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />
            新建分组
          </label>
          {draft.targetFolder && (
            <label>
              <input
                type="radio"
                name="merge-mode"
                value="join"
                checked={mode === "join"}
                onChange={() => setMode("join")}
              />
              合并到「{draft.targetFolder.name}」
            </label>
          )}
        </fieldset>
        {mode === "new" && (
          <div className="form-row">
            <Label htmlFor="folder-name">分组名</Label>
            <Input
              id="folder-name"
              autoFocus
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：灵感素材"
            />
          </div>
        )}
        <div className="merge-actions">
          <DialogClose asChild>
            <Button variant="secondary">取消</Button>
          </DialogClose>
          <Button
            disabled={mode === "new" && !name.trim()}
            onClick={() => {
              if (mode === "new" && name.trim()) {
                onConfirm({ mode: "new", name: name.trim() });
              } else if (mode === "join" && draft.targetFolder) {
                onConfirm({
                  mode: "join",
                  folderId: draft.targetFolder.id,
                });
              }
            }}
          >
            确认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewChip({ bookmark }: { bookmark: Bookmark }) {
  return (
    <span className="merge-chip">
      <img
        src={bookmark.icon ? `/assets/${bookmark.icon}` : undefined}
        alt=""
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <span>{bookmark.name}</span>
    </span>
  );
}
