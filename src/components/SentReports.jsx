// src/components/SentReports.jsx
// Admin-only outbox: pending reports uploaded by vendor-allocated team members.
// Groups entries by upload date, newest date first (like Daily Upload Allocation).
// "Send Gmail" reuses existing POST /upload/send-mail then marks the record sent (first-send-wins).
// "Send WhatsApp" is a clearly-labelled coming-soon stub — does NOT send anything.

import { useState, useEffect, useCallback } from "react";
import { uploadAPI } from "../api/api";

/* ─── helpers ─── */
function fmtDateKey(iso) {
  if (!iso) return "Unknown Date";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function groupByDate(list) {
  const groups = {};
  for (const r of list) {
    const key = fmtDateKey(r.reportUploadedAt);
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  // Already sorted newest-first from server, so key order matches insertion order
  return Object.entries(groups);
}

/* ─── Send Gmail Modal ─── */
function SendGmailModal({ record, mailConfigs, onSend, onClose, sending, sendError, sendSuccess }) {
  const candidateName = record.candidateName || "Candidate";
  const checkName     = record.checkName || "";
  const clientName    = record.clientName || "";

  const [to,          setTo]          = useState(record.vendorEmail || "");
  const [cc,          setCc]          = useState((record.vendorCcList || []).join(", "));
  const [subject,     setSubject]     = useState(`BGV Report - ${candidateName}${checkName ? ` (${checkName})` : ""}`);
  const [message,     setMessage]     = useState(
    `Dear Team,\n\nPlease find the attached BGV report.\n\nCandidate: ${candidateName}\nCheck: ${checkName}\nClient: ${clientName}\n\nRegards,\nTervies`
  );
  const [mailConfigId, setMailConfigId] = useState(mailConfigs[0]?._id || "");

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget && !sending) onClose(); }}
    >
      <div style={{ background:"var(--card)", borderRadius:"var(--r16)", width:"min(520px,94vw)", boxShadow:"0 24px 64px rgba(0,0,0,0.28)", padding:"28px 28px 24px", display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ fontFamily:"var(--head)", fontSize:16, fontWeight:700, color:"var(--text)" }}>
          Send Report via Gmail
        </div>

        {/* Case info chip */}
        <div style={{ fontSize:12, color:"var(--text3)", background:"rgba(37,99,235,0.06)", borderRadius:"var(--r8)", padding:"8px 12px" }}>
          <b style={{ color:"var(--text)" }}>{candidateName}</b>
          {checkName  && <span> · {checkName}</span>}
          {clientName && <span> · {clientName}</span>}
        </div>

        {/* Sender picker — only if multiple configs */}
        {mailConfigs.length > 1 && (
          <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <span style={{ fontSize:11, fontFamily:"var(--head)", fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Send From</span>
            <select value={mailConfigId} onChange={e => setMailConfigId(e.target.value)}
              style={{ padding:"8px 10px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)", background:"var(--card)", color:"var(--text)", fontSize:13 }}>
              {mailConfigs.map(m => <option key={m._id} value={m._id}>{m.fromName || m.user} ({m.user})</option>)}
            </select>
          </label>
        )}

        {/* To / CC / Subject */}
        {[
          { label:"To",      value:to,      set:setTo },
          { label:"CC",      value:cc,      set:setCc },
          { label:"Subject", value:subject, set:setSubject },
        ].map(({ label, value, set }) => (
          <label key={label} style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <span style={{ fontSize:11, fontFamily:"var(--head)", fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</span>
            <input value={value} onChange={e => set(e.target.value)}
              style={{ padding:"8px 10px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)", background:"var(--card)", color:"var(--text)", fontSize:13 }} />
          </label>
        ))}

        {/* Message */}
        <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <span style={{ fontSize:11, fontFamily:"var(--head)", fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Message</span>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
            style={{ padding:"8px 10px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)", background:"var(--card)", color:"var(--text)", fontSize:13, resize:"vertical", fontFamily:"inherit" }} />
        </label>

        {sendError   && <div style={{ fontSize:13, color:"#b91c1c", background:"rgba(239,68,68,0.07)", borderRadius:"var(--r8)", padding:"8px 12px" }}>⚠️ {sendError}</div>}
        {sendSuccess && <div style={{ fontSize:13, color:"#059669", background:"rgba(16,185,129,0.07)", borderRadius:"var(--r8)", padding:"8px 12px" }}>✓ {sendSuccess}</div>}

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} disabled={sending}
            style={{ fontFamily:"var(--head)", fontSize:13, fontWeight:600, padding:"9px 18px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)", background:"transparent", color:"var(--text)", cursor:"pointer" }}>
            Cancel
          </button>
          <button onClick={() => onSend({ to, cc, subject, message, mailConfigId })}
            disabled={sending || !to.trim()}
            style={{ fontFamily:"var(--head)", fontSize:13, fontWeight:600, padding:"9px 18px", borderRadius:"var(--r8)", border:"none", cursor: sending || !to.trim() ? "not-allowed" : "pointer", background: sending ? "rgba(37,99,235,0.3)" : "var(--accentg)", color:"#fff", opacity: !to.trim() ? 0.5 : 1 }}>
            {sending ? "Sending…" : "Send Email"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Row component ─── */
function ReportRow({ r, onViewClick, onGmailClick }) {
  return (
    <tr>
      <td style={{ padding:"11px 16px", fontSize:12, color:"var(--text3)", whiteSpace:"nowrap" }}>
        {fmtTime(r.reportUploadedAt)}
      </td>
      <td style={{ padding:"11px 16px", fontSize:12, color:"var(--text)" }}>
        {r.uploaderEmail}
      </td>
      <td style={{ padding:"11px 16px", fontSize:12, color:"var(--text)" }}>
        {r.vendorName || <span style={{ color:"var(--text3)" }}>—</span>}
        {r.vendorEmail && <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>{r.vendorEmail}</div>}
      </td>
      <td style={{ padding:"11px 16px", fontSize:13, color:"var(--text)", fontFamily:"var(--head)", fontWeight:600 }}>
        {r.clientName || "—"}
      </td>
      <td style={{ padding:"11px 16px", fontSize:12, color:"var(--text)" }}>
        <span style={{ fontWeight:600 }}>{r.candidateName || "—"}</span>
        {r.checkName && <span style={{ color:"var(--text3)" }}> · {r.checkName}</span>}
      </td>
      <td style={{ padding:"11px 16px", whiteSpace:"nowrap" }}>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {/* VIEW */}
          {r.reportFile && (
            <button onClick={() => onViewClick(r)}
              style={{ fontFamily:"var(--head)", fontSize:11, fontWeight:600, padding:"5px 11px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)", background:"transparent", color:"var(--accent)", cursor:"pointer", whiteSpace:"nowrap" }}>
              👁 View
            </button>
          )}

          {/* Send Gmail */}
          <button onClick={() => onGmailClick(r)}
            style={{ fontFamily:"var(--head)", fontSize:11, fontWeight:600, padding:"5px 11px", borderRadius:"var(--r8)", border:"none", background:"var(--accentg)", color:"#fff", cursor:"pointer", whiteSpace:"nowrap" }}>
            ✉ Gmail
          </button>

          {/* WhatsApp — COMING SOON: seam for future official WhatsApp Business API integration */}
          <button disabled title="Coming soon — WhatsApp Business API integration"
            style={{ fontFamily:"var(--head)", fontSize:11, fontWeight:600, padding:"5px 11px", borderRadius:"var(--r8)", border:"1.5px solid rgba(37,211,102,0.28)", background:"rgba(37,211,102,0.06)", color:"rgba(37,211,102,0.45)", cursor:"not-allowed", whiteSpace:"nowrap" }}>
            WhatsApp
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ─── Main screen ─── */
export default function SentReports({ onPendingCountChange }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingList,  setPendingList]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");

  // Modal state
  const [modalRecord,  setModalRecord]  = useState(null);
  const [mailConfigs,  setMailConfigs]  = useState([]);
  const [sending,      setSending]      = useState(false);
  const [sendError,    setSendError]    = useState("");
  const [sendSuccess,  setSendSuccess]  = useState("");

  const load = useCallback(() => {
    setLoading(true);
    uploadAPI.getSentReports()
      .then(data => {
        const count = data.pendingCount ?? 0;
        const list  = Array.isArray(data.pendingList) ? data.pendingList : [];
        setPendingCount(count);
        setPendingList(list);
        setError("");
        if (onPendingCountChange) onPendingCountChange(count);
      })
      .catch(e => setError(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [onPendingCountChange]);

  useEffect(() => { load(); }, [load]);

  const handleView = async (r) => {
    // Open a blank tab synchronously (avoids popup blockers), fill it in
    // once we've resolved the real URL — S3 presigned or legacy local.
    const win = window.open("", "_blank");
    try {
      const { url } = await uploadAPI.getReportViewUrl(r._id);
      if (url && win) {
        win.location.replace(url);
      } else if (win) {
        win.close();
        alert("Report not found.");
      }
    } catch (e) {
      if (win) win.close();
      alert(e.message || "Failed to open report.");
    }
  };

  const handleOpenGmail = async (r) => {
    setSendError("");
    setSendSuccess("");
    setMailConfigs([]);
    setModalRecord(r);
    try {
      const data = await uploadAPI.getMailConfigs();
      setMailConfigs(Array.isArray(data) ? data : []);
    } catch {
      setMailConfigs([]);
    }
  };

  const handleSend = async ({ to, cc, subject, message, mailConfigId }) => {
    if (!modalRecord) return;
    setSending(true);
    setSendError("");
    setSendSuccess("");
    try {
      await uploadAPI.sendCaseMail({ recordId: modalRecord._id, to, cc, subject, message, mailConfigId });
      await uploadAPI.markReportSent(modalRecord._id, "email");

      const newCount = Math.max(0, pendingCount - 1);
      setPendingCount(newCount);
      setPendingList(prev => prev.filter(r => r._id !== modalRecord._id));
      if (onPendingCountChange) onPendingCountChange(newCount);

      setSendSuccess(`Email sent to ${to}`);
      setTimeout(() => { setModalRecord(null); setSendSuccess(""); }, 1800);
    } catch (e) {
      setSendError(e.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const groups = groupByDate(pendingList);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {/* Header */}
      <div style={{ background:"var(--card)", border:"1.5px solid var(--border2)", borderRadius:"var(--r16)", padding:"20px 24px", boxShadow:"var(--shadow)", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontFamily:"var(--head)", fontSize:17, fontWeight:700, color:"var(--text)", marginBottom:4 }}>
            📤 Sent Reports
          </div>
          <div style={{ fontSize:13, color:"var(--text3)" }}>
            Reports uploaded by your team that haven't been sent yet. Today's pending: <b>{pendingCount}</b>.
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {pendingCount > 0 && (
            <div style={{ background:"rgba(239,68,68,0.10)", border:"1.5px solid rgba(239,68,68,0.30)", borderRadius:99, padding:"5px 14px", fontFamily:"var(--head)", fontSize:13, fontWeight:700, color:"#b91c1c" }}>
              {pendingCount} pending today
            </div>
          )}
          <button onClick={load}
            style={{ fontFamily:"var(--head)", fontSize:12, fontWeight:600, padding:"7px 14px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)", background:"transparent", color:"var(--text)", cursor:"pointer" }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign:"center", padding:"40px 0", color:"var(--text3)", fontFamily:"var(--head)", fontSize:14 }}>
          Loading…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ background:"rgba(239,68,68,0.07)", border:"1px solid rgba(239,68,68,0.28)", borderRadius:"var(--r12)", padding:"14px 18px", fontFamily:"var(--head)", fontSize:13, color:"#b91c1c" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && pendingList.length === 0 && (
        <div style={{ background:"var(--card)", border:"1.5px dashed var(--border2)", borderRadius:"var(--r16)", padding:"48px 24px", textAlign:"center", boxShadow:"var(--shadow)" }}>
          <div style={{ fontSize:40, marginBottom:12, opacity:0.25 }}>✅</div>
          <div style={{ fontFamily:"var(--head)", fontSize:16, fontWeight:700, color:"var(--text3)" }}>All clear</div>
          <div style={{ fontSize:13, color:"var(--text3)", marginTop:6 }}>No unsent reports from your team right now.</div>
        </div>
      )}

      {/* Grouped list */}
      {!loading && !error && groups.map(([dateLabel, items]) => (
        <div key={dateLabel} style={{ background:"var(--card)", border:"1.5px solid var(--border2)", borderRadius:"var(--r16)", boxShadow:"var(--shadow)", overflow:"hidden" }}>

          {/* Date group header — same style as Daily Upload Allocation */}
          <div style={{ padding:"12px 20px", background:"linear-gradient(135deg,rgba(20,184,166,0.08),rgba(37,99,235,0.05))", borderBottom:"1px solid var(--border2)", fontFamily:"var(--head)", fontSize:13, fontWeight:700, color:"var(--accent)", letterSpacing:"0.04em" }}>
            📅 {dateLabel} · {items.length} report{items.length !== 1 ? "s" : ""}
          </div>

          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"rgba(37,99,235,0.04)" }}>
                  {["Time", "Team Member", "Vendor", "Client", "Candidate · Check", "Actions"].map(h => (
                    <th key={h} style={{ padding:"9px 16px", textAlign:"left", fontFamily:"var(--head)", fontSize:11, fontWeight:600, color:"var(--text3)", letterSpacing:"0.06em", textTransform:"uppercase", borderBottom:"1px solid var(--border2)", whiteSpace:"nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={r._id} style={{ borderBottom: i < items.length - 1 ? "1px solid var(--border2)" : "none", background: i % 2 === 0 ? "transparent" : "rgba(37,99,235,0.02)" }}>
                    <td style={{ padding:"11px 16px", fontSize:12, color:"var(--text3)", whiteSpace:"nowrap" }}>
                      {fmtTime(r.reportUploadedAt)}
                    </td>
                    <td style={{ padding:"11px 16px", fontSize:12, color:"var(--text)" }}>
                      {r.uploaderEmail}
                    </td>
                    <td style={{ padding:"11px 16px", fontSize:12, color:"var(--text)" }}>
                      {r.vendorName || <span style={{ color:"var(--text3)" }}>—</span>}
                      {r.vendorEmail && <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>{r.vendorEmail}</div>}
                    </td>
                    <td style={{ padding:"11px 16px", fontSize:13, color:"var(--text)", fontFamily:"var(--head)", fontWeight:600 }}>
                      {r.clientName || "—"}
                    </td>
                    <td style={{ padding:"11px 16px", fontSize:12, color:"var(--text)" }}>
                      <span style={{ fontWeight:600 }}>{r.candidateName || "—"}</span>
                      {r.checkName && <span style={{ color:"var(--text3)" }}> · {r.checkName}</span>}
                    </td>
                    <td style={{ padding:"11px 16px", whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        {r.reportFile && (
                          <button onClick={() => handleView(r)}
                            style={{ fontFamily:"var(--head)", fontSize:11, fontWeight:600, padding:"5px 11px", borderRadius:"var(--r8)", border:"1.5px solid var(--border2)", background:"transparent", color:"var(--accent)", cursor:"pointer", whiteSpace:"nowrap" }}>
                            👁 View
                          </button>
                        )}
                        <button onClick={() => handleOpenGmail(r)}
                          style={{ fontFamily:"var(--head)", fontSize:11, fontWeight:600, padding:"5px 11px", borderRadius:"var(--r8)", border:"none", background:"var(--accentg)", color:"#fff", cursor:"pointer", whiteSpace:"nowrap" }}>
                          ✉ Gmail
                        </button>
                        {/* COMING SOON — seam for WhatsApp Business API */}
                        <button disabled title="Coming soon — WhatsApp Business API"
                          style={{ fontFamily:"var(--head)", fontSize:11, fontWeight:600, padding:"5px 11px", borderRadius:"var(--r8)", border:"1.5px solid rgba(37,211,102,0.28)", background:"rgba(37,211,102,0.06)", color:"rgba(37,211,102,0.45)", cursor:"not-allowed", whiteSpace:"nowrap" }}>
                          WhatsApp
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Gmail modal */}
      {modalRecord && (
        <SendGmailModal
          record={modalRecord}
          mailConfigs={mailConfigs}
          sending={sending}
          sendError={sendError}
          sendSuccess={sendSuccess}
          onClose={() => { if (!sending) { setModalRecord(null); setSendError(""); setSendSuccess(""); } }}
          onSend={handleSend}
        />
      )}
    </div>
  );
}
