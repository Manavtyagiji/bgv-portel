// src/components/StatusAuditLog.jsx
// "Close History" screen — read-only audit log of status changes.
// Visibility: admin (their tenant only) + super admin (all tenants).

import { useEffect, useState, useCallback } from "react";
import { auditAPI } from "../api/api";

const STATUS_COLORS = {
  closed:  { bg:"rgba(20,184,166,0.10)",  color:"#0d9488", border:"rgba(20,184,166,0.30)"  },
  pending: { bg:"rgba(245,158,11,0.10)",  color:"#b45309", border:"rgba(245,158,11,0.30)"  },
  insuff:  { bg:"rgba(124,58,237,0.10)",  color:"#6d28d9", border:"rgba(124,58,237,0.25)"  },
  hold:    { bg:"rgba(245,158,11,0.08)",  color:"#92400e", border:"rgba(245,158,11,0.22)"  },
  stop:    { bg:"rgba(239,68,68,0.09)",   color:"#b91c1c", border:"rgba(239,68,68,0.25)"   },
  sent:    { bg:"rgba(16,185,129,0.09)",  color:"#059669", border:"rgba(16,185,129,0.25)"  },
};

function StatusBadge({ value }) {
  const key = String(value || "").toLowerCase();
  const style = STATUS_COLORS[key] || { bg:"#f1f5f9", color:"#475569", border:"#cbd5e1" };
  return (
    <span style={{
      display:"inline-block", padding:"2px 10px", borderRadius:99,
      fontSize:11, fontWeight:700, letterSpacing:"0.03em",
      background:style.bg, color:style.color, border:`1px solid ${style.border}`,
    }}>
      {value || "—"}
    </span>
  );
}

function fmtDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-IN", {
      day:"2-digit", month:"short", year:"numeric",
      hour:"2-digit", minute:"2-digit",
    });
  } catch { return String(ts); }
}

export default function StatusAuditLog({ currentUser, tenantId }) {
  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  // Filters
  const [dateFrom,        setDateFrom]        = useState("");
  const [dateTo,          setDateTo]          = useState("");
  const [filterEmail,     setFilterEmail]     = useState("");
  const [filterStatus,    setFilterStatus]    = useState("");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (dateFrom)     params.dateFrom       = dateFrom;
      if (dateTo)       params.dateTo         = dateTo;
      if (filterEmail.trim()) params.changedByEmail = filterEmail.trim();
      if (filterStatus) params.newStatus      = filterStatus;
      const data = await auditAPI.list(params);
      setEntries(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load audit log.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, filterEmail, filterStatus]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  return (
    <div style={{padding:"28px 32px", maxWidth:1100, margin:"0 auto"}}>

      {/* Header */}
      <div style={{marginBottom:24}}>
        <h2 style={{fontFamily:"var(--head,sans-serif)",fontSize:22,fontWeight:800,color:"var(--text,#1e293b)",margin:0}}>
          🕐 Close History
        </h2>
        <p style={{fontSize:13,color:"var(--text3,#64748b)",marginTop:4,marginBottom:0}}>
          Audit log of every status change — newest first. Last 500 entries shown.
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display:"flex", flexWrap:"wrap", gap:12, marginBottom:20,
        background:"#fff", border:"1px solid var(--border2,#e2e8f0)",
        borderRadius:12, padding:"14px 18px",
      }}>
        <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:150}}>
          <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.06em"}}>From date</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{border:"1px solid #cbd5e1",borderRadius:8,padding:"6px 10px",fontSize:13,outline:"none"}} />
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:150}}>
          <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.06em"}}>To date</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{border:"1px solid #cbd5e1",borderRadius:8,padding:"6px 10px",fontSize:13,outline:"none"}} />
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:200}}>
          <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.06em"}}>Changed by</label>
          <input type="text" placeholder="Email..." value={filterEmail} onChange={e => setFilterEmail(e.target.value)}
            style={{border:"1px solid #cbd5e1",borderRadius:8,padding:"6px 10px",fontSize:13,outline:"none"}} />
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:140}}>
          <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.06em"}}>New status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{border:"1px solid #cbd5e1",borderRadius:8,padding:"6px 10px",fontSize:13,outline:"none",background:"#fff"}}>
            <option value="">All statuses</option>
            <option value="Closed">Closed</option>
            <option value="Pending">Pending</option>
            <option value="Insuff">Insuff</option>
            <option value="Hold">Hold</option>
            <option value="Stop">Stop</option>
            <option value="Sent">Sent</option>
          </select>
        </div>
        <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
          <button onClick={fetchEntries}
            style={{padding:"7px 18px",borderRadius:8,border:"none",background:"var(--accentg,#2563eb)",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            Search
          </button>
          <button onClick={() => { setDateFrom(""); setDateTo(""); setFilterEmail(""); setFilterStatus(""); }}
            style={{padding:"7px 14px",borderRadius:8,border:"1px solid #cbd5e1",background:"#f8fafc",fontWeight:600,fontSize:13,cursor:"pointer",color:"#475569"}}>
            Clear
          </button>
        </div>
      </div>

      {/* Status / count row */}
      <div style={{fontSize:13,color:"#64748b",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
        {loading && <span style={{color:"#2563eb"}}>Loading…</span>}
        {!loading && !error && <span>{entries.length} entr{entries.length === 1 ? "y" : "ies"}</span>}
        {error && <span style={{color:"#dc2626"}}>Error: {error}</span>}
      </div>

      {/* Table */}
      {!loading && entries.length === 0 && !error && (
        <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8",fontSize:14}}>
          No audit entries found for the selected filters.
        </div>
      )}

      {entries.length > 0 && (
        <div style={{overflowX:"auto",borderRadius:12,border:"1px solid var(--border2,#e2e8f0)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#f8fafc",borderBottom:"1.5px solid #e2e8f0"}}>
                {["Date & Time","Client","Candidate","Check ID","Old Status","New Status","Changed By","Role"].map(h => (
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",fontWeight:700,fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",whiteSpace:"nowrap"}}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e._id || i} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#fafbfc"}}>
                  <td style={{padding:"10px 14px",whiteSpace:"nowrap",color:"#1e293b"}}>{fmtDate(e.timestamp)}</td>
                  <td style={{padding:"10px 14px",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.clientName || "—"}</td>
                  <td style={{padding:"10px 14px",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.candidateName || "—"}</td>
                  <td style={{padding:"10px 14px",whiteSpace:"nowrap",color:"#475569"}}>{e.checkId || "—"}</td>
                  <td style={{padding:"10px 14px"}}><StatusBadge value={e.oldStatus || "—"} /></td>
                  <td style={{padding:"10px 14px"}}><StatusBadge value={e.newStatus} /></td>
                  <td style={{padding:"10px 14px",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#1e293b"}}>{e.changedByEmail}</td>
                  <td style={{padding:"10px 14px",whiteSpace:"nowrap",color:"#64748b",fontSize:11,fontWeight:600,textTransform:"capitalize"}}>{e.changedByRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
