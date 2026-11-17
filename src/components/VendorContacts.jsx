// src/components/VendorContacts.jsx
// Super-admin only. Manage vendor email contacts for auto-send on Daily Upload.
// Two ways to add: (1) type in the UI, (2) bulk-upload an Excel.
// Also shows the master auto-send toggle and the send log.

import { useState, useEffect, useRef } from "react";
import { vendorContactsAPI } from "../api/api";

// ── Helpers ──────────────────────────────────────────────────────────────────
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── CC chips input ────────────────────────────────────────────────────────────
function CcChips({ value, onChange }) {
  const [input, setInput] = useState("");
  const addChip = () => {
    const v = input.trim().toLowerCase();
    if (!v) return;
    if (!isValidEmail(v)) { alert(`Invalid email: ${v}`); return; }
    if (!value.includes(v)) onChange([...value, v]);
    setInput("");
  };
  const removeChip = (i) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, minHeight: 32 }}>
        {value.map((cc, i) => (
          <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "rgba(37,99,235,0.09)", border: "1px solid rgba(37,99,235,0.22)",
            borderRadius: 99, padding: "2px 10px", fontSize: 12,
            fontFamily: "var(--head)", fontWeight: 600, color: "var(--accent)",
          }}>
            {cc}
            <span onClick={() => removeChip(i)} style={{ cursor: "pointer", opacity: 0.6, marginLeft: 2, fontWeight: 700 }}>×</span>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(); } }}
          placeholder="Add CC email and press Enter"
          style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1.5px solid var(--border2)", fontSize: 13, background: "var(--bg2)", color: "var(--text)", outline: "none" }}
        />
        <button onClick={addChip} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--accentg)", color: "#fff", fontFamily: "var(--head)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Add</button>
      </div>
    </div>
  );
}

// ── Empty form state ─────────────────────────────────────────────────────────
const EMPTY_FORM = { vendorName: "", email: "", ccList: [], isActive: true };

// ── Main component ───────────────────────────────────────────────────────────
export default function VendorContacts() {
  const [tab,         setTab]         = useState("contacts"); // contacts | log
  const [contacts,    setContacts]    = useState([]);
  const [logs,        setLogs]        = useState([]);
  const [autoSend,    setAutoSend]    = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [saving,      setSaving]      = useState(false);

  // Form state (add / edit)
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [editingId,   setEditingId]   = useState(null); // null = add mode
  const [formError,   setFormError]   = useState("");
  const [showForm,    setShowForm]    = useState(false);

  // Bulk import
  const fileRef = useRef(null);
  const [importResult, setImportResult] = useState(null);
  const [importing,    setImporting]    = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const [cRes, sRes] = await Promise.all([
        vendorContactsAPI.list(),
        vendorContactsAPI.getSettings(),
      ]);
      setContacts(Array.isArray(cRes?.contacts) ? cRes.contacts : []);
      setAutoSend(!!sRes?.enabled);
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs() {
    try {
      const r = await vendorContactsAPI.getSendLog();
      setLogs(Array.isArray(r?.logs) ? r.logs : []);
    } catch {}
  }

  function switchTab(t) {
    setTab(t);
    if (t === "log") loadLogs();
  }

  // ── Toggle auto-send ─────────────────────────────────────────────────────
  async function toggleAutoSend() {
    const next = !autoSend;
    setSaving(true);
    try {
      await vendorContactsAPI.saveSettings({ enabled: next });
      setAutoSend(next);
    } catch (e) {
      alert("Failed to save setting: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Form helpers ─────────────────────────────────────────────────────────
  function openAdd() {
    setForm(EMPTY_FORM); setEditingId(null); setFormError(""); setShowForm(true);
  }
  function openEdit(c) {
    setForm({ vendorName: c.vendorName, email: c.email || "", ccList: c.ccList || [], isActive: c.isActive !== false });
    setEditingId(c._id); setFormError(""); setShowForm(true);
  }
  function cancelForm() { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setFormError(""); }

  async function submitForm() {
    setFormError("");
    if (!form.vendorName.trim()) { setFormError("Vendor name is required"); return; }
    if (form.email && !isValidEmail(form.email)) { setFormError("Invalid email address"); return; }

    setSaving(true);
    try {
      if (editingId) {
        await vendorContactsAPI.update(editingId, form);
      } else {
        await vendorContactsAPI.create(form);
      }
      cancelForm();
      await load();
    } catch (e) {
      setFormError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete vendor contact for "${name}"?`)) return;
    setSaving(true);
    try {
      await vendorContactsAPI.remove(id);
      await load();
    } catch (e) {
      alert("Delete failed: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Bulk import ──────────────────────────────────────────────────────────
  async function handleBulkFile(e) {
    const file = e.target.files?.[0];
    if (!fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setImporting(true); setImportResult(null);
    try {
      const r = await vendorContactsAPI.bulkImport(file);
      setImportResult(r);
      await load();
    } catch (ex) {
      setImportResult({ error: ex.message });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── Styles shared ────────────────────────────────────────────────────────
  const card = { background: "var(--card)", border: "1.5px solid var(--border2)", borderRadius: "var(--r16)", padding: "20px 24px", boxShadow: "var(--shadow)" };
  const inputStyle = { width: "100%", padding: "8px 11px", borderRadius: 8, border: "1.5px solid var(--border2)", fontSize: 13, background: "var(--bg2)", color: "var(--text)", outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontFamily: "var(--head)", fontSize: 12, fontWeight: 600, color: "var(--text3)", marginBottom: 4, display: "block" };
  const btnPrimary = { fontFamily: "var(--head)", fontSize: 13, fontWeight: 600, padding: "8px 18px", borderRadius: 8, border: "none", background: "var(--accentg)", color: "#fff", cursor: "pointer" };
  const btnGhost  = { fontFamily: "var(--head)", fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: "1.5px solid var(--border2)", background: "transparent", color: "var(--text)", cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--head)", fontSize: 17, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              📧 Vendor Contacts
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)" }}>
              Manage vendor emails for auto-send on Daily Excel upload. Super Admin only.
            </div>
          </div>

          {/* Master auto-send toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: autoSend ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.07)", border: `1.5px solid ${autoSend ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.25)"}`, borderRadius: 10, padding: "8px 14px" }}>
            <span style={{ fontFamily: "var(--head)", fontSize: 13, fontWeight: 600, color: autoSend ? "#059669" : "#b91c1c" }}>
              Auto-send: {autoSend ? "ON" : "OFF"}
            </span>
            <button onClick={toggleAutoSend} disabled={saving}
              style={{ ...btnPrimary, padding: "5px 12px", fontSize: 12, background: autoSend ? "#b91c1c" : "#059669" }}>
              {saving ? "…" : autoSend ? "Turn OFF" : "Turn ON"}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {[["contacts","Vendor Contacts"],["log","Send Log"]].map(([id,label]) => (
          <button key={id} onClick={() => switchTab(id)}
            style={{ ...btnGhost, borderBottom: tab === id ? "2.5px solid var(--accent)" : "2.5px solid transparent", color: tab === id ? "var(--accent)" : "var(--text3)", borderRadius: "8px 8px 0 0" }}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--text3)", fontFamily: "var(--head)", fontSize: 14 }}>Loading…</div>}
      {!loading && error && <div style={{ padding: "14px 18px", borderRadius: 10, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", color: "#b91c1c", fontSize: 13 }}>⚠️ {error}</div>}

      {/* ── Contacts tab ───────────────────────────────────────────────── */}
      {!loading && !error && tab === "contacts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Action bar */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={openAdd} style={btnPrimary}>+ Add Vendor</button>

            {/* Bulk import */}
            <label style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              {importing ? "Importing…" : "⬆ Bulk Import Excel"}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleBulkFile} disabled={importing} />
            </label>

            <span style={{ fontSize: 12, color: "var(--text3)", alignSelf: "center" }}>
              Excel columns: <b>Vendor Name</b>, <b>Email</b>, <b>CC</b> (comma-separated)
            </span>
          </div>

          {/* Import result */}
          {importResult && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: importResult.error ? "rgba(239,68,68,0.07)" : "rgba(16,185,129,0.07)", border: `1px solid ${importResult.error ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`, fontSize: 13, color: importResult.error ? "#b91c1c" : "#065f46" }}>
              {importResult.error
                ? `❌ Import failed: ${importResult.error}`
                : `✅ Import done — ${importResult.added} added, ${importResult.updated} updated, ${importResult.skipped} skipped${importResult.errors?.length ? ` · ${importResult.errors.length} row error(s)` : ""}`}
              {importResult.errors?.length > 0 && (
                <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                  {importResult.errors.map((e, i) => <li key={i} style={{ fontSize: 12 }}>{e}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Add / Edit form (inline) */}
          {showForm && (
            <div style={{ ...card, borderColor: "rgba(37,99,235,0.3)" }}>
              <div style={{ fontFamily: "var(--head)", fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>
                {editingId ? "Edit Vendor Contact" : "Add Vendor Contact"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Vendor Name *</label>
                  <input value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} placeholder="e.g. RJ Verification" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email (TO)</label>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="vendor@example.com" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={labelStyle}>CC Emails</label>
                <CcChips value={form.ccList} onChange={cc => setForm(f => ({ ...f, ccList: cc }))} />
              </div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} id="isActiveChk" />
                <label htmlFor="isActiveChk" style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>Active (will receive auto-emails)</label>
              </div>
              {formError && <div style={{ marginTop: 8, fontSize: 13, color: "#b91c1c" }}>⚠️ {formError}</div>}
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button onClick={submitForm} disabled={saving} style={btnPrimary}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Vendor"}</button>
                <button onClick={cancelForm} style={btnGhost}>Cancel</button>
              </div>
            </div>
          )}

          {/* Contacts table */}
          {contacts.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 10 }}>📭</div>
              <div style={{ fontFamily: "var(--head)", fontSize: 15, fontWeight: 700, color: "var(--text3)" }}>No vendor contacts yet</div>
              <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 4 }}>Add vendors above or bulk-import an Excel file.</div>
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(37,99,235,0.04)" }}>
                    {["Vendor Name","Email (TO)","CC Emails","Status",""].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontFamily: "var(--head)", fontSize: 11, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={c._id} style={{ borderBottom: i < contacts.length - 1 ? "1px solid var(--border2)" : "none", background: i % 2 === 0 ? "transparent" : "rgba(37,99,235,0.015)" }}>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--head)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{c.vendorName}</td>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: c.email ? "var(--text)" : "var(--text3)", fontStyle: c.email ? "normal" : "italic" }}>{c.email || "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: "var(--text3)" }}>
                        {(c.ccList || []).length === 0 ? <span style={{ fontStyle: "italic" }}>None</span>
                          : (c.ccList || []).map((cc, j) => (
                            <span key={j} style={{ display: "inline-block", marginRight: 4, background: "rgba(37,99,235,0.07)", borderRadius: 99, padding: "1px 8px", fontSize: 11 }}>{cc}</span>
                          ))}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <span style={{ fontSize: 11, fontFamily: "var(--head)", fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: c.isActive ? "rgba(16,185,129,0.09)" : "rgba(239,68,68,0.08)", color: c.isActive ? "#059669" : "#b91c1c", border: `1px solid ${c.isActive ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.22)"}` }}>
                          {c.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button onClick={() => openEdit(c)} style={{ ...btnGhost, padding: "5px 12px", fontSize: 12, marginRight: 6 }}>Edit</button>
                        <button onClick={() => handleDelete(c._id, c.vendorName)} style={{ ...btnGhost, padding: "5px 12px", fontSize: 12, color: "#b91c1c", borderColor: "rgba(239,68,68,0.3)" }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Send Log tab ───────────────────────────────────────────────── */}
      {tab === "log" && (
        <div style={card}>
          <div style={{ fontFamily: "var(--head)", fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 14 }}>Send Log (last 200)</div>
          {logs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text3)", fontSize: 13 }}>No sends logged yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                <thead>
                  <tr style={{ background: "rgba(37,99,235,0.04)" }}>
                    {["Sent At","Vendor","TO","CC","Cases","Result"].map(h => (
                      <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontFamily: "var(--head)", fontSize: 11, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, i) => (
                    <tr key={l._id || i} style={{ borderBottom: i < logs.length - 1 ? "1px solid var(--border2)" : "none" }}>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text3)", whiteSpace: "nowrap" }}>{fmtDate(l.sentAt)}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontFamily: "var(--head)", fontWeight: 600, color: "var(--text)" }}>{l.vendorName}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text)" }}>{l.to || "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text3)" }}>{(l.cc || []).join(", ") || "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontFamily: "var(--head)", fontWeight: 600, textAlign: "center" }}>{l.caseCount}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 11, fontFamily: "var(--head)", fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: l.success ? "rgba(16,185,129,0.09)" : "rgba(239,68,68,0.08)", color: l.success ? "#059669" : "#b91c1c", border: `1px solid ${l.success ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.22)"}` }}>
                          {l.success ? "✅ Sent" : "❌ Failed"}
                        </span>
                        {!l.success && l.errorMsg && <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 3, maxWidth: 220 }}>{l.errorMsg}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
