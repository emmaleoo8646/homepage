"use client";
import type { DragEvent, MouseEvent } from "react";
import { MoreHorizontal, Plus, FolderOpen, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconImage } from "@/components/bookmark-icon";
import { Tile } from "@/components/tile";
import { layoutMembers } from "@/lib/folder-layout";
import { iconColors, type Bookmark, type Folder } from "@/lib/home-data";

export interface FolderTileProps {
  folder: Folder;
  members: Bookmark[];
  /** Draws the dashed outline while a dragged bookmark hovers the tile. */
  isDropTarget: boolean;
  /** Opens the folder manager panel. */
  onOpen: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onDragStartMember: (bookmarkId: string, e: DragEvent) => void;
  onDragEndMember: () => void;
  onDragOverFolder: (folderId: string) => void;
  onDragLeave: () => void;
  onDropOnFolder: (folderId: string, e: DragEvent<HTMLDivElement>) => void;
}

/**
 * One folder in the category grid: a glassy box showing up to 16 member
 * favicons, laid out by `layoutMembers`.
 *
 * The box itself is a `<div>`, not a `<button>` — the cover icons are real
 * `<a>` links so a click opens that member's site (with native middle-click
 * and "open in new tab" behaviour), and a button can't legally contain
 * links. Each link stops click propagation so it doesn't also trigger the
 * card's own "open folder" handler; clicking the padding, the gaps between
 * icons, or the name underneath still opens the folder.
 */
export function FolderTile({
  folder,
  members,
  isDropTarget,
  onOpen,
  onRemoveFolder,
  onDragStartMember,
  onDragEndMember,
  onDragOverFolder,
  onDragLeave,
  onDropOnFolder,
}: FolderTileProps) {
  const layout = layoutMembers(members);

  // Inner .folder-icons grid template — what N looks like inside the box.
  // N=0 (empty folder) and N=1 both render as a single 60px square; N≥2
  // renders as a 2×2 grid, with row 2 left empty for N=2 and progressively
  // filled (with stacks) as N grows.
  const innerTemplate =
    layout.mode === "1x1"
      ? { gridTemplateColumns: "60px", gridTemplateRows: "60px" }
      : {
          gridTemplateColumns: "repeat(2, 60px)",
          gridTemplateRows: "repeat(2, 60px)",
        };

  // Outer <Tile> grid placement — covers the right cells in the home-grid /
  // bookmark-grid. Inline style overrides `.folder-tile-inline` defaults so
  // an empty / single-member folder occupies one cell, while a folder with
  // ≥2 members occupies a 2×2 square (with row 2 unused for N=2).
  const tileBoxSize =
    layout.mode === "1x1"
      ? { gridColumn: "span 1", gridRow: "span 1" }
      : { gridColumn: "span 2", gridRow: "span 2" };

  const openFolder = () => onOpen(folder.id);

  // A cover icon is a link; the card underneath is the "open folder" button.
  // Without this the click would navigate *and* pop the folder panel open.
  const keepCardClick = (e: MouseEvent) => e.stopPropagation();

  return (
    <Tile
      name={folder.name}
      position={`folder-tile-inline ${isDropTarget ? "drop-target" : ""}`}
      style={tileBoxSize}
      labelAction={{ label: `打开${folder.name}分组`, onClick: openFolder }}
    >
      <div
        className="widget folder-card"
        onClick={openFolder}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverFolder(folder.id);
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDropOnFolder(folder.id, e)}
      >
        <div className="folder-icons" style={innerTemplate}>
          {layout.cells.map((cell, ci) => {
            if (cell.kind === "single") {
              const bm = cell.bookmark;
              // Empty placeholder cells (N=0) stay inert so the click still
              // opens the folder instead of navigating nowhere. White
              // backing is the "add a bookmark here" affordance.
              if (!bm) {
                return (
                  <div className="folder-icon" key={ci} style={{ background: "#fff" }}>
                    <Plus size={30} />
                  </div>
                );
              }
              return (
                <a
                  className="folder-icon folder-icon-link"
                  key={ci}
                  href={bm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`打开${bm.name}`}
                  draggable
                  onClick={keepCardClick}
                  onDragStart={(e) => onDragStartMember(bm.id, e)}
                  onDragEnd={onDragEndMember}
                  style={{ background: iconColors[bm.icon] ?? "#fff" }}
                >
                  <IconImage icon={bm.icon} name={bm.name} url={bm.url} />
                </a>
              );
            }
            return (
              <div
                className="folder-icon folder-icon-stack"
                style={{ background: "rgba(255,255,255,0.18)" }}
                key={ci}
              >
                {cell.bookmarks.map((m) => (
                  <a
                    className="folder-icon-stack-cell folder-icon-link"
                    key={m.id}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`打开${m.name}`}
                    draggable
                    onClick={keepCardClick}
                    onDragStart={(e) => onDragStartMember(m.id, e)}
                    onDragEnd={onDragEndMember}
                    style={{ background: iconColors[m.icon] ?? "#fff" }}
                  >
                    <IconImage icon={m.icon} name={m.name} url={m.url} />
                  </a>
                ))}
                {cell.overflow > 0 && (
                  <span className="folder-overflow-badge">
                    +{cell.overflow}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="bookmark-more"
            aria-label={`管理${folder.name}分组`}
          >
            <MoreHorizontal size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={openFolder}>
            <FolderOpen />
            打开分组
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onRemoveFolder(folder.id)}
          >
            <Trash2 />
            删除分组
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Tile>
  );
}