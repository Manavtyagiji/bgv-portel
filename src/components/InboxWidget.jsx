// InboxWidget.jsx
// Floating, chatbot-style access to the Inbox from every screen — super
// admin only. Wraps the existing full Inbox component unchanged (same
// component used on the dedicated "Inbox" nav page); this is purely a
// second entry point, not a rewrite of any inbox logic.
//
// IMPORTANT: once opened for the first time, <Inbox/> stays MOUNTED for the
// rest of the session — closing, minimizing, and maximizing only toggle CSS
// visibility, never unmount it. Inbox does a slow, fresh IMAP fetch on every
// mount (Stage 1's "no caching" design), so unmounting/remounting on every
// minimize or close was forcing a full reload each time AND resetting
// whatever message was open. Keeping it mounted makes every open after the
// first one instant and never loses your place.
//
// The panel is a real floating window: drag the header to reposition, drag
// any edge or corner to resize, or use the minimize/maximize buttons like a
// normal window's title bar. Position/size are clamped so it can never be
// dragged/resized fully off-screen.
import { useState, useRef, useCallback, useEffect } from "react";
import Inbox from "./Inbox.jsx";

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 520;
const MIN_WIDTH = 380;
const MIN_HEIGHT = 340;
const HEADER_HEIGHT = 44;

// direction: which edges move on resize — 'n'/'s' affect top+height,
// 'e'/'w' affect left+width. Corner handles combine two of these.
const RESIZE_HANDLES = [
  { dir: "n",  cursor: "ns-resize",   style: { top: 0, left: 12, right: 12, height: 6 } },
  { dir: "s",  cursor: "ns-resize",   style: { bottom: 0, left: 12, right: 12, height: 6 } },
  { dir: "w",  cursor: "ew-resize",   style: { left: 0, top: 12, bottom: 12, width: 6 } },
  { dir: "e",  cursor: "ew-resize",   style: { right: 0, top: 12, bottom: 12, width: 6 } },
  { dir: "nw", cursor: "nwse-resize", style: { top: 0, left: 0, width: 14, height: 14 } },
  { dir: "ne", cursor: "nesw-resize", style: { top: 0, right: 0, width: 14, height: 14 } },
  { dir: "sw", cursor: "nesw-resize", style: { bottom: 0, left: 0, width: 14, height: 14 } },
  { dir: "se", cursor: "nwse-resize", style: { bottom: 0, right: 0, width: 14, height: 14 } },
];

export default function InboxWidget({ currentUser, isTeam, unreadCount = 0 }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(null); // { top, left, width, height } — also doubles as "has been opened before"
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const dragState = useRef(null); // { mode: 'move'|'resize', direction, startX, startY, startBox }

  const openWidget = () => {
    if (!box) {
      const width = Math.min(DEFAULT_WIDTH, window.innerWidth - 32);
      const height = Math.min(DEFAULT_HEIGHT, window.innerHeight - 110);
      setBox({
        left: Math.max(16, window.innerWidth - width - 24),
        top: Math.max(16, window.innerHeight - height - 92),
        width,
        height,
      });
    }
    setOpen(true);
  };

  const clamp = useCallback((next) => {
    const width = Math.max(MIN_WIDTH, Math.min(next.width, window.innerWidth - 32));
    const height = Math.max(MIN_HEIGHT, Math.min(next.height, window.innerHeight - 32));
    const left = Math.max(0, Math.min(next.left, window.innerWidth - 120));
    const top = Math.max(0, Math.min(next.top, window.innerHeight - 60));
    return { left, top, width, height };
  }, []);

  const onPointerMove = useCallback((e) => {
    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const { startBox, direction } = drag;

    if (drag.mode === "move") {
      setBox(clamp({ ...startBox, left: startBox.left + dx, top: startBox.top + dy }));
      return;
    }

    let { left, top, width, height } = startBox;
    if (direction.includes("e")) width = startBox.width + dx;
    if (direction.includes("s")) height = startBox.height + dy;
    if (direction.includes("w")) { width = startBox.width - dx; left = startBox.left + dx; }
    if (direction.includes("n")) { height = startBox.height - dy; top = startBox.top + dy; }
    setBox(clamp({ left, top, width, height }));
  }, [clamp]);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
  }, [onPointerMove]);

  // Minimize and maximize are mutually exclusive, like a normal OS window —
  // clicking one always exits the other. Without this, minimizing while
  // already maximized did nothing visible: the frame calculation only
  // applies the minimized (header-only) height inside the non-maximized
  // branch, so the panel just stayed full-screen.
  const toggleMinimize = () => {
    setMinimized(m => !m);
    setMaximized(false);
  };
  const toggleMaximize = () => {
    setMaximized(m => !m);
    setMinimized(false);
  };

  const startDrag = (mode, direction = null) => (e) => {
    if (maximized) return; // dragging/resizing a maximized window doesn't apply
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { mode, direction, startX: e.clientX, startY: e.clientY, startBox: box };
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
  };

  // Keep the panel on-screen if the browser window itself gets resized.
  useEffect(() => {
    if (!open) return;
    const onResize = () => setBox(prev => (prev ? clamp(prev) : prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, clamp]);

  const frame = box && (maximized
    ? { top: 20, left: 20, width: "calc(100vw - 40px)", height: "calc(100vh - 40px)" }
    : { top: box.top, left: box.left, width: box.width, height: minimized ? HEADER_HEIGHT : box.height });

  return (
    <>
      {!open && (
        <button
          onClick={openWidget}
          title="Open Inbox"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 9998,
            width: 56, height: 56, borderRadius: "50%",
            background: "var(--accentg, #2563eb)", color: "#fff",
            border: "none", cursor: "pointer",
            boxShadow: "0 8px 24px rgba(37,99,235,0.35)",
            fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          📧
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 20, height: 20, borderRadius: 99,
              background: "#ef4444", color: "#fff",
              fontSize: 11, fontWeight: 800, fontFamily: "var(--head)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 5px", border: "2px solid var(--card, #fff)",
            }}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Rendered as soon as it's been opened once, kept mounted forever
          after (see note at top) — visibility toggled purely via CSS. */}
      {box && (
        <div
          style={{
            position: "fixed", zIndex: 9997, ...frame,
            display: open ? "flex" : "none",
            background: "var(--card, #fff)",
            border: "1.5px solid var(--border2, #e2e8f0)",
            borderRadius: "var(--r16, 16px)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
            overflow: "hidden", flexDirection: "column",
            transition: "width 0.15s, height 0.15s, top 0.15s, left 0.15s",
          }}
        >
          <div
            onMouseDown={startDrag("move")}
            onDoubleClick={toggleMaximize}
            style={{
              flexShrink: 0, cursor: maximized ? "default" : "move", userSelect: "none",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", background: "var(--accentg, #2563eb)", color: "#fff",
              fontFamily: "var(--head)", fontSize: 13, fontWeight: 700,
            }}
          >
            <span>📧 Inbox{unreadCount > 0 ? ` (${unreadCount})` : ""}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={toggleMinimize}
                title={minimized ? "Restore" : "Minimize"}
                style={winBtnStyle}
              >
                {minimized ? "▢" : "─"}
              </button>
              <button
                onClick={toggleMaximize}
                title={maximized ? "Restore" : "Maximize"}
                style={winBtnStyle}
              >
                {maximized ? "❐" : "□"}
              </button>
              <button onClick={() => setOpen(false)} title="Close" style={winBtnStyle}>
                ✕
              </button>
            </div>
          </div>

          <div style={{ display: minimized ? "none" : "flex", flex: 1, overflow: "auto", flexDirection: "column" }}>
            <Inbox currentUser={currentUser} isTeam={isTeam} />
          </div>

          {!minimized && !maximized && RESIZE_HANDLES.map(h => (
            <div
              key={h.dir}
              onMouseDown={startDrag("resize", h.dir)}
              title="Drag to resize"
              style={{ position: "absolute", cursor: h.cursor, zIndex: 2, ...h.style }}
            />
          ))}
        </div>
      )}
    </>
  );
}

const winBtnStyle = {
  background: "rgba(255,255,255,0.18)", border: "none", color: "#fff",
  borderRadius: 6, width: 22, height: 22, cursor: "pointer", fontSize: 12,
  display: "flex", alignItems: "center", justifyContent: "center",
};
