import type { CSSProperties, ReactNode } from "react";

/**
 * The grid cell wrapper every bookmark / widget sits in: a `.tile-surface`
 * box for the visual, plus the name underneath it.
 *
 * `labelAction` turns the name into a real `<button>`. Folder tiles need it
 * because their cover icons are links now (each opens a bookmark), so the
 * name is what opens the folder panel instead — and a button is the only
 * way to keep that reachable from the keyboard.
 */
export function Tile({
  name,
  position,
  children,
  style,
  labelAction,
}: {
  name: string;
  position: string;
  children: ReactNode;
  style?: CSSProperties;
  labelAction?: { label: string; onClick: () => void };
}) {
  return (
    <div className={`tile ${position}`} style={style}>
      <div className="tile-surface">{children}</div>
      {labelAction ? (
        <button
          className="tile-label tile-label-action"
          aria-label={labelAction.label}
          onClick={labelAction.onClick}
        >
          {name}
        </button>
      ) : (
        <span className="tile-label">{name}</span>
      )}
    </div>
  );
}