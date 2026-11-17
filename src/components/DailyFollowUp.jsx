// src/components/DailyFollowUp.jsx
// Super Admin's internal team only (Super Admin, Manager, TL, internal
// Team). Each person owns one fully free-form spreadsheet — their own
// column layout, their own rows, edited exactly like Google Sheets: click
// a header to rename it, "+" to add a column, click any cell to edit it,
// "+ Add Row" for a new row, autosaves shortly after you stop typing.
//
// Super Admin/Manager can additionally browse a "Team Member" picker to
// open (read-only) any team member's own sheet, using their own custom
// columns exactly as that person set them up — everyone's sheet always
// looks the way THEY built it, not a shared template.
import { useState, useEffect, useCallback, useRef } from "react";
import { dailyFollowUpAPI } from "../api/api";

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fmtUpdated(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function DailyFollowUp({ currentUser }) {
  const role = String(currentUser?.role || "").toLowerCase();
  const canBrowseTeam = role === "superadmin" || role === "manager";
  const myEmail = String(currentUser?.email || "").trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [viewingEmail, setViewingEmail] = useState(""); // "" = my own sheet
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const saveTimerRef = useRef(null);
  const skipNextAutosaveRef = useRef(false);

  const isReadOnly = viewingEmail && viewingEmail !== myEmail;

  const loadMySheet = useCallback(() => {
    setLoading(true);
    skipNextAutosaveRef.current = true;
    dailyFollowUpAPI.getMySheet()
      .then(sheet => {
        setColumns(Array.isArray(sheet?.columns) ? sheet.columns : []);
        setRows(Array.isArray(sheet?.rows) ? sheet.rows : []);
      })
      .catch(() => { setColumns([]); setRows([]); })
      .finally(() => setLoading(false));
  }, []);

  const loadMemberSheet = useCallback((email) => {
    setLoading(true);
    dailyFollowUpAPI.getMemberSheet(email)
      .then(sheet => {
        setColumns(Array.isArray(sheet?.columns) ? sheet.columns : []);
        setRows(Array.isArray(sheet?.rows) ? sheet.rows : []);
      })
      .catch(() => { setColumns([]); setRows([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (viewingEmail && viewingEmail !== myEmail) loadMemberSheet(viewingEmail);
    else loadMySheet();
  }, [viewingEmail, myEmail, loadMySheet, loadMemberSheet]);

  useEffect(() => {
    if (!canBrowseTeam) return;
    dailyFollowUpAPI.listSheets()
      .then(list => setMembers(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [canBrowseTeam]);

  // Debounced autosave — fires ~900ms after the last edit to my own sheet.
  // Never fires while read-only viewing someone else's, and skips the one
  // change caused by loading a fresh sheet in (skipNextAutosaveRef).
  useEffect(() => {
    if (isReadOnly || loading) return;
    if (skipNextAutosaveRef.current) { skipNextAutosaveRef.current = false; return; }
    setSaveState("saving");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      dailyFollowUpAPI.saveMySheet(columns, rows)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("idle"));
    }, 900);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, rows]);

  const renameColumn = (colId, label) => {
    if (isReadOnly) return;
    setColumns(prev => prev.map(c => (c.id === colId ? { ...c, label } : c)));
  };

  const addColumn = () => {
    if (isReadOnly) return;
    setColumns(prev => [...prev, { id: uid("col"), label: `Column ${prev.length + 1}` }]);
  };

  const deleteColumn = (colId) => {
    if (isReadOnly) return;
    if (!window.confirm("Delete this column? Any data in it will be lost.")) return;
    setColumns(prev => prev.filter(c => c.id !== colId));
    setRows(prev => prev.map(r => {
      const cells = { ...r.cells };
      delete cells[colId];
      return { ...r, cells };
    }));
  };

  const updateCell = (rowId, colId, value) => {
    if (isReadOnly) return;
    setRows(prev => prev.map(r => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r)));
  };

  const addRow = () => {
    if (isReadOnly) return;
    setRows(prev => [...prev, { id: uid("row"), cells: {} }]);
  };

  const deleteRow = (rowId) => {
    if (isReadOnly) return;
    setRows(prev => prev.filter(r => r.id !== rowId));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        .dfu-grid { border-collapse: collapse; }
        .dfu-grid th, .dfu-grid td {
          border: 1px solid var(--border2);
          padding: 0;
          min-width: 140px;
        }
        .dfu-rownum {
          min-width: 36px !important; width: 36px;
          text-align: center; color: var(--text3); font-size: 11px;
          background: rgba(37,99,235,0.04); font-family: var(--head);
        }
        .dfu-colhead {
          background: rgba(37,99,235,0.06);
          position: sticky; top: 0; z-index: 1;
        }
        .dfu-input {
          width: 100%; box-sizing: border-box; border: 1px solid transparent;
          background: transparent; padding: 7px 9px; font-size: 13px;
          font-family: var(--body); color: var(--text); outline: none;
        }
        .dfu-input:hover { background: rgba(37,99,235,0.04); }
        .dfu-input:focus { border-color: #2563eb; background: var(--card); }
        .dfu-head-input {
          width: 100%; box-sizing: border-box; border: none; background: transparent;
          padding: 7px 9px; font-size: 12px; font-weight: 700; font-family: var(--head);
          color: var(--text); outline: none; text-transform: none;
        }
        .dfu-head-input:focus { background: var(--card); box-shadow: inset 0 0 0 1.5px #2563eb; }
        .dfu-addcol {
          min-width: 40px !important; width: 40px; background: rgba(37,99,235,0.04);
          text-align: center; cursor: pointer; color: #2563eb; font-weight: 700;
        }
        .dfu-addcol:hover { background: rgba(37,99,235,0.1); }
      `}</style>

      <div style={{
        background: "var(--card)", border: "1.5px solid var(--border2)",
        borderRadius: "var(--r16)", padding: "16px 24px", boxShadow: "var(--shadow)",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: "var(--head)", fontSize: 17, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
            📝 Daily Follow-Up
          </div>
          <div style={{ fontSize: 13, color: "var(--text3)" }}>
            {isReadOnly
              ? `Viewing ${members.find(m => m.ownerEmail === viewingEmail)?.ownerName || viewingEmail}'s sheet — read only`
              : "Your own sheet — build it however you need. Rename headers, add columns, add rows."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!isReadOnly && (
            <span style={{ fontSize: 11.5, color: "var(--text3)", fontStyle: "italic" }}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : ""}
            </span>
          )}
          {canBrowseTeam && members.length > 0 && (
            <select value={viewingEmail} onChange={e => setViewingEmail(e.target.value)}
              style={{ fontFamily: "var(--head)", fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: "var(--r8)", border: "1.5px solid var(--border2)", background: "var(--card)", color: "var(--text)" }}>
              <option value="">My own sheet</option>
              {members.filter(m => m.ownerEmail !== myEmail).map(m => (
                <option key={m.ownerEmail} value={m.ownerEmail}>{m.ownerName} ({m.rowCount} rows{m.updatedAt ? `, ${fmtUpdated(m.updatedAt)}` : ""})</option>
              ))}
            </select>
          )}
          {!isReadOnly && (
            <button onClick={addRow} style={{
              fontFamily: "var(--head)", fontSize: 12, fontWeight: 600, padding: "8px 16px",
              borderRadius: "var(--r8)", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer",
            }}>
              + Add Row
            </button>
          )}
        </div>
      </div>

      <div style={{ background: "var(--card)", border: "1.5px solid var(--border2)", borderRadius: "var(--r16)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>Loading…</div>
          ) : columns.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>
              {isReadOnly ? "This person hasn't set up any columns yet." : "No columns yet."}
              {!isReadOnly && (
                <div style={{ marginTop: 12 }}>
                  <button onClick={addColumn} style={{
                    fontFamily: "var(--head)", fontSize: 12, fontWeight: 600, padding: "8px 16px",
                    borderRadius: "var(--r8)", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer",
                  }}>+ Add your first column</button>
                </div>
              )}
            </div>
          ) : (
            <table className="dfu-grid">
              <thead>
                <tr>
                  <th className="dfu-rownum dfu-colhead">#</th>
                  {columns.map(col => (
                    <th key={col.id} className="dfu-colhead">
                      <div style={{ display: "flex", alignItems: "center" }}>
                        {isReadOnly ? (
                          <div style={{ padding: "7px 9px", fontSize: 12, fontWeight: 700, fontFamily: "var(--head)", color: "var(--text)" }}>{col.label}</div>
                        ) : (
                          <input
                            className="dfu-head-input"
                            value={col.label}
                            onChange={e => renameColumn(col.id, e.target.value)}
                          />
                        )}
                        {!isReadOnly && (
                          <button onClick={() => deleteColumn(col.id)} title="Delete column"
                            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#dc2626", fontSize: 11, padding: "0 8px" }}>
                            ✕
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  {!isReadOnly && (
                    <th className="dfu-addcol dfu-colhead" onClick={addColumn} title="Add column">+</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>
                      {isReadOnly ? "No rows yet." : "No rows yet — click \"+ Add Row\" above to start."}
                    </td>
                  </tr>
                ) : rows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="dfu-rownum">
                      <div style={{ padding: "7px 4px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        {idx + 1}
                        {!isReadOnly && (
                          <button onClick={() => deleteRow(row.id)} title="Delete row"
                            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#dc2626", fontSize: 10, padding: 0 }}>
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                    {columns.map(col => (
                      <td key={col.id}>
                        {isReadOnly ? (
                          <div style={{ padding: "7px 9px" }}>{row.cells?.[col.id] || ""}</div>
                        ) : (
                          <input
                            className="dfu-input"
                            value={row.cells?.[col.id] || ""}
                            onChange={e => updateCell(row.id, col.id, e.target.value)}
                          />
                        )}
                      </td>
                    ))}
                    {!isReadOnly && <td></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
