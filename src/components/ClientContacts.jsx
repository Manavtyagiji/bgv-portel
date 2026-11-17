// src/components/ClientContacts.jsx
// Admin-only: view and edit email + CC on per-state client rows stored in the
// Pricing collection (the single shared store). This screen never creates or
// deletes state rows — that is done in Add Clients → Client Price / State.
// Bulk import updates email+CC only; clientPrice is never touched.

import { useState, useEffect, useRef, useCallback } from "react";
import { pricingAPI } from "../api/api";

/* ── helpers ── */
function normKey(v) {
  return String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
}
function isValidEmail(e = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
}

/* ── CC chip input ── */
function CcChips({ chips, onChange, disabled }) {
  const [input, setInput] = useState("");
  const ref = useRef(null);

  const flush = (raw) => {
    const vals = String(raw || "").split(/[,;]+/).map(s => s.trim().toLowerCase()).filter(isValidEmail);
    if (vals.length) onChange([...chips, ...vals]);
    setInput("");
  };

  return (
    <div
      onClick={() => !disabled && ref.current?.focus()}
      style={{
        display:"flex", flexWrap:"wrap", gap:5, padding:"6px 10px",
        borderRadius:"var(--r8)", border:"1.5px solid var(--border2)",
        background: disabled ? "rgba(248,250,255,0.5)" : "var(--card)",
        cursor: disabled ? "default" : "text", minHeight:34,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {chips.map((c, i) => (
        <span key={i} style={{
          display:"inline-flex", alignItems:"center", gap:4,
          background:"rgba(37,99,235,0.09)", border:"1px solid rgba(37,99,235,0.22)",
          borderRadius:99, padding:"2px 8px", fontSize:11.5,
          color:"var(--accent)", fontFamily:"var(--head)", fontWeight:600,
        }}>
          {c}
          {!disabled && (
            <span onClick={() => onChange(chips.filter((_, j) => j !== i))}
              style={{ cursor:"pointer", opacity:0.6, fontWeight:700, fontSize:13 }}>×</span>
          )}
        </span>
      ))}
      <input
        ref={ref}
        value={input}
        disabled={disabled}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (["Enter","Tab",","," "].includes(e.key)) { e.preventDefault(); flush(input); }
          if (e.key === "Backspace" && !input && chips.length) onChange(chips.slice(0, -1));
        }}
        onBlur={() => flush(input)}
        placeholder={chips.length ? "" : "Type email, press Enter or comma"}
        style={{ border:"none", outline:"none", background:"transparent", fontSize:12.5, color:"var(--text)", minWidth:140, flex:1 }}
      />
    </div>
  );
}

/* ── derive per-client contact rows from pricingRules ── */
function extractContactRows(pricingRules) {
  const clients = [];
  for (const [scopeKey, rules] of Object.entries(pricingRules || {})) {
    // Skip vendor/global/internal pseudo-keys — real client names never start with "__"
    if (String(scopeKey).startsWith("__")) continue;
    if (!Array.isArray(rules)) continue;
    const stateRows = rules
      .map((r, ruleIdx) => ({ ...r, ruleIdx }))
      .filter(r => r.clientPrice !== undefined && r.clientPrice !== null);
    if (!stateRows.length) continue;
    clients.push({ scopeKey, clientName: scopeKey, stateRows });
  }
  return clients.sort((a, b) => normKey(a.clientName).localeCompare(normKey(b.clientName)));
}

const labelStyle = {
  fontSize:11, fontFamily:"var(--head)", fontWeight:600, color:"var(--text3)",
  textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3, display:"block",
};
const inputStyle = {
  padding:"7px 10px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)",
  background:"var(--card)", color:"var(--text)", fontSize:13, width:"100%", boxSizing:"border-box",
};

export default function ClientContacts() {
  const [tab, setTab]              = useState("list");
  const [pricingRules, setPricing] = useState({});
  const [loading, setLoading]      = useState(true);
  const [error, setError]          = useState("");

  // Client selection
  const [selectedClient, setSelectedClient] = useState(null); // scopeKey string

  // Bulk apply
  const [bulkEmail, setBulkEmail]         = useState("");
  const [bulkCc, setBulkCc]               = useState([]);
  const [bulkSaving, setBulkSaving]       = useState(false);
  const [bulkMsg, setBulkMsg]             = useState("");
  const [checkedStates, setCheckedStates] = useState(new Set()); // Set<ruleIdx>

  // Per-state inline edit
  const [editKey, setEditKey]   = useState(null); // "scopeKey__state"
  const [editEmail, setEditEmail] = useState("");
  const [editCc, setEditCc]     = useState([]);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");

  // Bulk import
  const [importFile, setImportFile]     = useState(null);
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError]   = useState("");
  const fileRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    pricingAPI.getAll()
      .then(data => { setPricing(data || {}); setError(""); })
      .catch(e  => setError(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const clients   = extractContactRows(pricingRules);
  const clientData = clients.find(c => c.scopeKey === selectedClient) || null;

  /* ── switch client — clear transient state ── */
  const pickClient = (scopeKey) => {
    setSelectedClient(scopeKey || null);
    setCheckedStates(new Set());
    setEditKey(null);
    setSaveMsg("");
    setBulkMsg("");
  };

  /* ── checkbox helpers ── */
  const toggleCheck = (ruleIdx) => {
    setCheckedStates(prev => {
      const next = new Set(prev);
      if (next.has(ruleIdx)) next.delete(ruleIdx); else next.add(ruleIdx);
      return next;
    });
  };
  const toggleAll = () => {
    if (!clientData) return;
    const allIdx = clientData.stateRows.map(sr => sr.ruleIdx);
    const allChecked = allIdx.every(i => checkedStates.has(i));
    setCheckedStates(allChecked ? new Set() : new Set(allIdx));
  };

  /* ── bulk apply (mode: "all" | "selected") ── */
  const handleBulkApply = async (mode) => {
    if (bulkEmail && !isValidEmail(bulkEmail)) { setBulkMsg("❌ Invalid email address."); return; }
    const badCc = bulkCc.filter(e => !isValidEmail(e));
    if (badCc.length) { setBulkMsg(`❌ Invalid CC: ${badCc.join(", ")}`); return; }
    if (!bulkEmail && bulkCc.length === 0) { setBulkMsg("❌ Enter an email or CC to apply."); return; }
    if (!clientData) return;

    const idxToUpdate = mode === "all"
      ? new Set(clientData.stateRows.map(sr => sr.ruleIdx))
      : new Set([...checkedStates].filter(i => clientData.stateRows.some(sr => sr.ruleIdx === i)));

    if (idxToUpdate.size === 0) { setBulkMsg("❌ No states selected."); return; }

    setBulkSaving(true);
    setBulkMsg("");
    try {
      const currentRules = pricingRules[clientData.scopeKey] || [];
      const updatedRules = currentRules.map((r, i) => {
        if (!idxToUpdate.has(i)) return r;
        // Only email + ccList changed — clientPrice, district, state, rate, vendorName untouched
        return { ...r, email: bulkEmail.trim().toLowerCase(), ccList: [...bulkCc] };
      });
      await pricingAPI.saveScope(clientData.scopeKey, updatedRules);
      setPricing(prev => ({ ...prev, [clientData.scopeKey]: updatedRules }));
      const n = idxToUpdate.size;
      setBulkMsg(`✓ Applied to ${n} state${n !== 1 ? "s" : ""}`);
      setCheckedStates(new Set());
    } catch (e) {
      setBulkMsg("❌ " + (e.message || "Save failed"));
    } finally {
      setBulkSaving(false);
    }
  };

  /* ── start inline edit for one state row ── */
  const startEdit = (scopeKey, stateRow) => {
    setEditKey(`${scopeKey}__${stateRow.state}`);
    setEditEmail(stateRow.email || "");
    setEditCc(Array.isArray(stateRow.ccList) ? stateRow.ccList : []);
    setSaveMsg("");
  };

  /* ── save email + CC for one state row ── */
  const handleSave = async (scopeKey, stateRow) => {
    setSaveMsg("");
    if (editEmail && !isValidEmail(editEmail)) { setSaveMsg("❌ Invalid email address."); return; }
    const badCc = editCc.filter(e => !isValidEmail(e));
    if (badCc.length) { setSaveMsg(`❌ Invalid CC: ${badCc.join(", ")}`); return; }

    setSaving(true);
    try {
      const currentRules = pricingRules[scopeKey] || [];
      const updatedRules = currentRules.map((r, i) => {
        if (i !== stateRow.ruleIdx) return r;
        return { ...r, email: editEmail.trim().toLowerCase(), ccList: editCc };
      });
      await pricingAPI.saveScope(scopeKey, updatedRules);
      setPricing(prev => ({ ...prev, [scopeKey]: updatedRules }));
      setSaveMsg("✓ Saved");
      setEditKey(null);
    } catch (e) {
      setSaveMsg("❌ " + (e.message || "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  /* ── bulk Excel import ── */
  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true); setImportResult(null); setImportError("");
    try {
      const result = await pricingAPI.bulkImportContacts(importFile);
      setImportResult(result);
      load();
    } catch (e) { setImportError(e.message || "Import failed."); }
    finally { setImporting(false); }
  };

  // Derived checkbox state
  const allIdx      = clientData?.stateRows.map(sr => sr.ruleIdx) || [];
  const allChecked  = allIdx.length > 0 && allIdx.every(i => checkedStates.has(i));
  const someChecked = allIdx.some(i => checkedStates.has(i));
  const checkedCount = allIdx.filter(i => checkedStates.has(i)).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {/* ── Header ── */}
      <div style={{ background:"var(--card)", border:"1.5px solid var(--border2)", borderRadius:"var(--r16)", padding:"20px 24px", boxShadow:"var(--shadow)" }}>
        <div style={{ fontFamily:"var(--head)", fontSize:17, fontWeight:700, color:"var(--text)", marginBottom:4 }}>📬 Client Contacts</div>
        <div style={{ fontSize:13, color:"var(--text3)", lineHeight:1.6 }}>
          Email + CC per state for "Send to Client". Reads from the same per-state rows as Add Clients — no separate store.<br/>
          To add a new state row, go to <b>Add Clients → Client Price / State</b> first.
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:"flex", gap:8 }}>
        {[["list","📋 Contacts"], ["import","📥 Bulk Import"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ fontFamily:"var(--head)", fontSize:13, fontWeight:600, padding:"8px 18px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)", cursor:"pointer", background: tab===id ? "var(--accentg)" : "var(--card)", color: tab===id ? "#fff" : "var(--text)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════ LIST TAB ══════════════ */}
      {tab === "list" && (
        <>
          {loading && (
            <div style={{ textAlign:"center", padding:"32px 0", color:"var(--text3)", fontSize:14 }}>Loading…</div>
          )}
          {!loading && error && (
            <div style={{ background:"rgba(239,68,68,0.07)", border:"1px solid rgba(239,68,68,0.28)", borderRadius:"var(--r12)", padding:"14px 18px", fontSize:13, color:"#b91c1c" }}>⚠️ {error}</div>
          )}

          {!loading && !error && (
            <>
              {/* ── Client picker ── */}
              <div style={{ background:"var(--card)", border:"1.5px solid var(--border2)", borderRadius:"var(--r16)", padding:"18px 20px", boxShadow:"var(--shadow)" }}>
                <label>
                  <span style={labelStyle}>Select Client</span>
                  <select
                    value={selectedClient || ""}
                    onChange={e => pickClient(e.target.value || null)}
                    style={{
                      ...inputStyle,
                      appearance:"none", cursor:"pointer", paddingRight:32,
                      backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
                      backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center",
                    }}
                  >
                    <option value="">— Select a client ({clients.length} available) —</option>
                    {clients.map(c => (
                      <option key={c.scopeKey} value={c.scopeKey}>
                        {c.clientName}  ({c.stateRows.length} state{c.stateRows.length !== 1 ? "s" : ""})
                      </option>
                    ))}
                  </select>
                </label>
                {clients.length === 0 && (
                  <div style={{ marginTop:10, fontSize:13, color:"var(--text3)" }}>
                    No client state rows yet. Add per-state rows in <b>Add Clients → Client Price / State</b> first.
                  </div>
                )}
              </div>

              {/* ── Selected client view ── */}
              {clientData && (
                <>
                  {/* Bulk apply card */}
                  <div style={{ background:"var(--card)", border:"1.5px solid rgba(37,99,235,0.22)", borderRadius:"var(--r16)", padding:"18px 20px", boxShadow:"var(--shadow)" }}>
                    <div style={{ fontFamily:"var(--head)", fontSize:13, fontWeight:700, color:"var(--text)", marginBottom:12 }}>
                      ✉️ Bulk Apply — <span style={{ color:"var(--accent)" }}>{clientData.clientName}</span>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                      <label>
                        <span style={labelStyle}>Email (TO)</span>
                        <input
                          value={bulkEmail}
                          onChange={e => setBulkEmail(e.target.value)}
                          placeholder="client@company.com"
                          type="email"
                          style={inputStyle}
                        />
                      </label>
                      <label>
                        <span style={labelStyle}>CC Emails</span>
                        <CcChips chips={bulkCc} onChange={setBulkCc} />
                      </label>
                    </div>
                    {bulkMsg && (
                      <div style={{
                        fontSize:12.5,
                        color: bulkMsg.startsWith("✓") ? "#059669" : "#b91c1c",
                        background: bulkMsg.startsWith("✓") ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)",
                        borderRadius:"var(--r8)", padding:"7px 12px", marginBottom:10,
                      }}>
                        {bulkMsg}
                      </div>
                    )}
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <button
                        onClick={() => handleBulkApply("all")}
                        disabled={bulkSaving}
                        style={{ fontFamily:"var(--head)", fontSize:12, fontWeight:600, padding:"7px 16px", borderRadius:"var(--r8)", border:"none", background: bulkSaving ? "rgba(37,99,235,0.3)" : "var(--accentg)", color:"#fff", cursor: bulkSaving ? "not-allowed" : "pointer", whiteSpace:"nowrap" }}>
                        {bulkSaving ? "Saving…" : `Apply to All ${clientData.stateRows.length} States`}
                      </button>
                      {checkedCount > 0 && (
                        <button
                          onClick={() => handleBulkApply("selected")}
                          disabled={bulkSaving}
                          style={{ fontFamily:"var(--head)", fontSize:12, fontWeight:600, padding:"7px 16px", borderRadius:"var(--r8)", border:"1.5px solid var(--accentg)", background:"transparent", color:"var(--accent)", cursor: bulkSaving ? "not-allowed" : "pointer", whiteSpace:"nowrap" }}>
                          Apply to Selected ({checkedCount})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* State rows table */}
                  <div style={{ background:"var(--card)", border:"1.5px solid var(--border2)", borderRadius:"var(--r16)", overflow:"hidden", boxShadow:"var(--shadow)" }}>
                    {/* Client header with select-all checkbox */}
                    <div style={{ padding:"12px 20px", background:"rgba(37,99,235,0.04)", borderBottom:"1px solid var(--border2)", display:"flex", alignItems:"center", gap:10 }}>
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                        onChange={toggleAll}
                        style={{ cursor:"pointer", width:15, height:15, flexShrink:0 }}
                        title={allChecked ? "Deselect all" : "Select all"}
                      />
                      <span style={{ fontFamily:"var(--head)", fontSize:14, fontWeight:700, color:"var(--text)" }}>
                        🏢 {clientData.clientName}
                      </span>
                      <span style={{ fontSize:11, fontFamily:"var(--head)", fontWeight:600, color:"var(--text3)", background:"rgba(37,99,235,0.08)", border:"1px solid rgba(37,99,235,0.18)", borderRadius:99, padding:"2px 9px" }}>
                        {clientData.stateRows.length} state{clientData.stateRows.length !== 1 ? "s" : ""}
                      </span>
                      {checkedCount > 0 && (
                        <span style={{ fontSize:11, fontFamily:"var(--head)", fontWeight:600, color:"var(--accent)", marginLeft:"auto" }}>
                          {checkedCount} selected
                        </span>
                      )}
                    </div>

                    {/* Per-state rows */}
                    {clientData.stateRows.map((sr, si) => {
                      const key       = `${clientData.scopeKey}__${sr.state}`;
                      const isEditing = editKey === key;
                      const isChecked = checkedStates.has(sr.ruleIdx);
                      return (
                        <div key={si} style={{
                          padding:"14px 20px",
                          borderBottom: si < clientData.stateRows.length - 1 ? "1px solid var(--border2)" : "none",
                          background: isEditing
                            ? "rgba(37,99,235,0.03)"
                            : isChecked ? "rgba(37,99,235,0.02)" : "transparent",
                        }}>
                          {/* Row header */}
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom: isEditing ? 12 : 0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleCheck(sr.ruleIdx)}
                                style={{ cursor:"pointer", width:15, height:15, flexShrink:0 }}
                              />
                              <span style={{ fontFamily:"var(--head)", fontSize:13, fontWeight:700, color:"var(--accent2)" }}>
                                📍 {sr.state || "—"}
                              </span>
                              <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--head)", fontWeight:600 }}>
                                ₹{sr.clientPrice}
                              </span>
                              {!isEditing && (
                                <span style={{ fontSize:12, color:"var(--text2)" }}>
                                  {sr.email
                                    ? <>📧 {sr.email}{sr.ccList?.length ? <span style={{color:"var(--text3)"}}> · CC: {sr.ccList.join(", ")}</span> : null}</>
                                    : <span style={{ color:"var(--text3)", fontStyle:"italic" }}>no email set</span>
                                  }
                                </span>
                              )}
                            </div>
                            {!isEditing && (
                              <button onClick={() => startEdit(clientData.scopeKey, sr)}
                                style={{ fontFamily:"var(--head)", fontSize:11, fontWeight:600, padding:"5px 13px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)", background:"transparent", color:"var(--accent)", cursor:"pointer", whiteSpace:"nowrap" }}>
                                {sr.email ? "Edit" : "+ Set Email"}
                              </button>
                            )}
                          </div>

                          {/* Inline edit form */}
                          {isEditing && (
                            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                                <label>
                                  <span style={labelStyle}>Email (TO)</span>
                                  <input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                                    placeholder="client@company.com" type="email" style={inputStyle} />
                                </label>
                                <label>
                                  <span style={labelStyle}>CC Emails</span>
                                  <CcChips chips={editCc} onChange={setEditCc} />
                                </label>
                              </div>
                              {saveMsg && (
                                <div style={{ fontSize:12.5, color: saveMsg.startsWith("✓") ? "#059669" : "#b91c1c", background: saveMsg.startsWith("✓") ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)", borderRadius:"var(--r8)", padding:"7px 12px" }}>
                                  {saveMsg}
                                </div>
                              )}
                              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                                <button onClick={() => { setEditKey(null); setSaveMsg(""); }}
                                  style={{ fontFamily:"var(--head)", fontSize:12, fontWeight:600, padding:"6px 14px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)", background:"transparent", color:"var(--text)", cursor:"pointer" }}>
                                  Cancel
                                </button>
                                <button onClick={() => handleSave(clientData.scopeKey, sr)} disabled={saving}
                                  style={{ fontFamily:"var(--head)", fontSize:12, fontWeight:600, padding:"6px 16px", borderRadius:"var(--r8)", border:"none", background: saving ? "rgba(37,99,235,0.3)" : "var(--accentg)", color:"#fff", cursor: saving ? "not-allowed" : "pointer" }}>
                                  {saving ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ══════════════ BULK IMPORT TAB (unchanged) ══════════════ */}
      {tab === "import" && (
        <div style={{ background:"var(--card)", border:"1.5px solid var(--border2)", borderRadius:"var(--r16)", padding:"24px", boxShadow:"var(--shadow)", display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ fontFamily:"var(--head)", fontSize:14, fontWeight:700, color:"var(--text)" }}>📥 Bulk Import Email + CC per State</div>
          <div style={{ fontSize:13, color:"var(--text3)", lineHeight:1.7 }}>
            Upload an <b>.xlsx</b> file with columns: <b>Client Name</b>, <b>Email</b>, <b>CC</b>, <b>State</b>.<br/>
            <b>Updates existing per-state rows only</b> — never creates new rows, never touches price.<br/>
            If a Client Name or State doesn't match an existing row, that Excel row is skipped and reported.<br/>
            CC cell: multiple emails separated by comma or semicolon.
          </div>

          <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls"
              onChange={e => { setImportFile(e.target.files[0] || null); setImportResult(null); setImportError(""); }}
              style={{ fontSize:13, color:"var(--text)" }} />
            <button onClick={handleImport} disabled={!importFile || importing}
              style={{ fontFamily:"var(--head)", fontSize:13, fontWeight:600, padding:"8px 20px", borderRadius:"var(--r8)", border:"none", background: !importFile||importing ? "rgba(37,99,235,0.3)" : "var(--accentg)", color:"#fff", cursor: !importFile||importing ? "not-allowed" : "pointer", whiteSpace:"nowrap" }}>
              {importing ? "Importing…" : "Import"}
            </button>
          </div>

          {importError && (
            <div style={{ fontSize:13, color:"#b91c1c", background:"rgba(239,68,68,0.07)", borderRadius:"var(--r8)", padding:"10px 14px" }}>⚠️ {importError}</div>
          )}

          {importResult && (
            <div style={{ fontSize:13, background:"rgba(16,185,129,0.07)", border:"1px solid rgba(16,185,129,0.22)", borderRadius:"var(--r8)", padding:"14px 18px", lineHeight:1.8 }}>
              <b style={{ color:"#059669" }}>✓ Import complete</b><br/>
              Updated: <b>{importResult.updated}</b> · Skipped: <b>{importResult.skipped}</b>
              {importResult.errors?.length > 0 && (
                <div style={{ marginTop:10, color:"#92400e", background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:"var(--r8)", padding:"10px 14px" }}>
                  <b>Skipped rows:</b>
                  <ul style={{ margin:"6px 0 0 16px", padding:0 }}>
                    {importResult.errors.map((e, i) => <li key={i} style={{ marginBottom:2 }}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
