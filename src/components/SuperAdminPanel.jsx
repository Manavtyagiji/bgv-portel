/**
 * SuperAdminPanel.jsx — FIXED
 * KEY FIX: TAC codes are now stored and looked up in UPPERCASE
 * so validateTenantAccessCode() always finds them correctly.
 */

import { useState, useMemo, useEffect } from "react";
import {
  getAllUsers, saveAllUsers, getAllTenants, deleteTenant,
  generateTenantAccessCode, saveTenantAccessCode,
  deleteTenantAccessCode, getAllTenantAccessCodes,
  approveClientAdmin, approveInternalStaff,
  approveClientTeam, revokeUser, rejectUser,
  hydratePortalState, syncLocalPortalState,
} from "../utils/tenantAuth";

/* ─────────────────────────── CSS ────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

.sa { font-family:'Sora',sans-serif; color:#0d1117; }
.sa-title { font-size:23px; font-weight:700; letter-spacing:-0.3px; color:#0d1117; margin-bottom:4px; }
.sa-sub   { font-size:13px; color:#656d76; display:flex; align-items:center; gap:8px; margin-bottom:22px; }

/* Stats */
.sa-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:11px; margin-bottom:22px; }
.sa-stat  { background:#fff; border:1px solid #d0d7de; border-radius:10px; padding:14px 16px; }
.sa-stat-l { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.09em; color:#656d76; margin-bottom:4px; }
.sa-stat-v { font-size:26px; font-weight:700; color:#0d1117; }
.sv-blue   { color:#0969da; }
.sv-green  { color:#2da44e; }
.sv-amber  { color:#9a6700; }
.sv-purple { color:#8250df; }
.sv-red    { color:#cf222e; }

/* Pending alert */
.sa-alert { display:flex; align-items:center; gap:12px; background:rgba(154,103,0,0.07); border:1px solid rgba(154,103,0,0.28); border-radius:10px; padding:12px 16px; margin-bottom:20px; flex-wrap:wrap; }
.sa-alert-t { font-size:13.5px; font-weight:700; color:#7d4e00; }
.sa-alert-s { font-size:12px; color:#7d4e00; margin-top:2px; opacity:0.85; }

/* Section */
.sa-sec   { margin-bottom:26px; }
.sa-sec-h { font-size:14px; font-weight:700; color:#0d1117; margin-bottom:12px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.sa-sec-badge { background:rgba(9,105,218,0.08); border:1px solid rgba(9,105,218,0.20); color:#0969da; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:99px; }
.sa-sec-note  { font-size:11.5px; font-weight:400; color:#656d76; }

/* TAC box */
.sa-tac {
  background:#fff;
  border:1.5px solid rgba(9,105,218,0.30);
  border-radius:12px;
  box-shadow:0 2px 12px rgba(9,105,218,0.08);
  overflow:hidden;
}
.sa-tac-head {
  background:linear-gradient(135deg,rgba(9,105,218,0.07),rgba(130,80,223,0.05));
  border-bottom:1px solid rgba(9,105,218,0.15);
  padding:14px 20px 12px;
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
}
.sa-tac-head-icon { font-size:20px; }
.sa-tac-head-t { font-size:14px; font-weight:700; color:#0d1117; }
.sa-tac-head-s { font-size:12px; color:#656d76; margin-top:2px; }
.sa-tac-body { padding:18px 20px; }

/* TAC generate form */
.sa-tac-form { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-bottom:14px; }
.sa-tac-f    { display:flex; flex-direction:column; gap:4px; flex:1; min-width:160px; }
.sa-tac-l    { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:#656d76; }
.sa-tac-i    { font-family:'Sora',sans-serif; font-size:13.5px; background:#f6f8fa; border:1px solid #d0d7de; border-radius:8px; padding:9px 12px; color:#0d1117; outline:none; transition:all 0.15s; }
.sa-tac-i:focus { border-color:#0969da; box-shadow:0 0 0 3px rgba(9,105,218,0.10); background:#fff; }
.sa-tac-i::placeholder { color:#8c959f; }

/* TAC code list */
.sa-tac-list { display:flex; flex-direction:column; gap:8px; }
.sa-tac-row  {
  display:flex; align-items:center; gap:10px; padding:10px 14px;
  background:#f6f8fa; border:1px solid #d0d7de; border-radius:9px; flex-wrap:wrap;
}
.sa-tac-row.used { opacity:0.5; background:#f0f0f0; }
.sa-tac-code { font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:600; color:#0969da; flex:1; min-width:0; }
.sa-tac-meta { font-size:11px; color:#8c959f; }
.sa-tac-used { font-size:10.5px; font-weight:700; color:#8c959f; background:#e8eaed; border-radius:5px; padding:2px 8px; }
.sa-tac-empty{ font-size:13px; color:#8c959f; font-style:italic; padding:6px 0; }
.sa-tac-hint {
  margin-top:14px; padding:11px 14px;
  background:rgba(9,105,218,0.05); border:1px solid rgba(9,105,218,0.18);
  border-radius:8px; font-size:12px; color:#0550ae; line-height:1.6;
}
.sa-tac-hint ol { margin:6px 0 0 16px; }
.sa-tac-hint li { margin-bottom:3px; }

/* Generic card */
.sa-card { background:#fff; border:1px solid #d0d7de; border-radius:12px; overflow:hidden; }
.sa-card-h {
  display:flex; align-items:center; gap:12px; padding:14px 18px 12px;
  border-bottom:1px solid #f0f2f4;
  background:linear-gradient(135deg,rgba(9,105,218,0.03),rgba(130,80,223,0.02));
  flex-wrap:wrap;
}
.sa-card-icon { width:38px; height:38px; border-radius:10px; flex-shrink:0; background:linear-gradient(135deg,#0969da,#8250df); display:flex; align-items:center; justify-content:center; font-size:17px; color:#fff; }
.sa-card-name { font-size:14px; font-weight:700; color:#0d1117; }
.sa-card-id   { font-size:10.5px; color:#8c959f; margin-top:2px; font-family:'JetBrains Mono',monospace; }
.sa-card-meta { font-size:11px; color:#8c959f; }
.sa-card-b    { padding:14px 18px 16px; display:flex; flex-direction:column; gap:11px; }

/* Status pills */
.pill { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:99px; flex-shrink:0; }
.pill-active   { background:rgba(45,164,78,0.10);  border:1px solid rgba(45,164,78,0.25);  color:#116329; }
.pill-inactive { background:rgba(154,103,0,0.10);  border:1px solid rgba(154,103,0,0.25);  color:#7d4e00; }
.pill-pending  { background:rgba(9,105,218,0.08);  border:1px solid rgba(9,105,218,0.22);  color:#0550ae; }
.pill-approved { background:rgba(45,164,78,0.08);  border:1px solid rgba(45,164,78,0.22);  color:#116329; }
.pill-rejected { background:rgba(207,34,46,0.08);  border:1px solid rgba(207,34,46,0.22);  color:#82071e; }

/* Invite code */
.sa-inv-row { display:flex; align-items:center; gap:8px; }
.sa-inv-code { flex:1; min-width:0; font-family:'JetBrains Mono',monospace; font-size:12px; color:#0969da; background:rgba(9,105,218,0.06); border:1px solid rgba(9,105,218,0.18); border-radius:6px; padding:6px 10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* User rows */
.sa-ul    { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#8c959f; margin-bottom:7px; display:flex; align-items:center; gap:7px; }
.sa-ul-ct { background:rgba(9,105,218,0.08); border:1px solid rgba(9,105,218,0.18); color:#0969da; font-size:10px; font-weight:700; padding:1px 7px; border-radius:99px; }
.sa-ur {
  display:flex; align-items:center; gap:9px; padding:9px 12px;
  border-radius:8px; background:#f6f8fa; border:1px solid #e8eaed;
  margin-bottom:5px; flex-wrap:wrap; transition:all 0.12s;
}
.sa-ur:hover { background:#eaf0fb; border-color:rgba(9,105,218,0.20); }
.sa-ur:last-child { margin-bottom:0; }
.sa-av { width:30px; height:30px; border-radius:8px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#fff; }
.av-a { background:linear-gradient(135deg,#0969da,#8250df); }
.av-t { background:linear-gradient(135deg,#2da44e,#1da140); }
.av-p { background:linear-gradient(135deg,#9a6700,#bf8700); }
.av-r { background:linear-gradient(135deg,#cf222e,#a01f2b); }
.sa-un  { font-size:13px; font-weight:600; color:#0d1117; }
.sa-ue  { font-size:11.5px; color:#8c959f; margin-top:1px; }
.sa-um  { font-size:10.5px; color:#a0a8b0; margin-top:2px; font-family:'JetBrains Mono',monospace; }

/* Admin code display */
.sa-acode { display:flex; align-items:center; gap:7px; margin-top:5px; flex-wrap:wrap; }
.sa-acode-l { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:#8c959f; }
.sa-acode-v { font-family:'JetBrains Mono',monospace; font-size:11.5px; color:#8250df; background:rgba(130,80,223,0.07); border:1px solid rgba(130,80,223,0.18); border-radius:5px; padding:2px 8px; }

/* Divider */
.sa-div { height:1px; background:#f0f2f4; margin:2px 0 10px; }

/* Buttons */
.sa-acts { display:flex; gap:6px; flex-wrap:wrap; }
.sa-btn  { font-family:'Sora',sans-serif; font-size:11.5px; font-weight:700; border:none; border-radius:7px; padding:6px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.14s; }
.sa-btn:hover  { transform:translateY(-1px); filter:brightness(1.06); }
.sa-btn:active { transform:scale(0.97); }
.sb-approve  { background:linear-gradient(135deg,#2da44e,#26943f); color:#fff; box-shadow:0 2px 8px rgba(45,164,78,0.22); }
.sb-revoke   { background:rgba(154,103,0,0.10); border:1px solid rgba(154,103,0,0.28); color:#7d4e00; }
.sb-reject   { background:rgba(207,34,46,0.08); border:1px solid rgba(207,34,46,0.25); color:#82071e; }
.sb-activate { background:linear-gradient(135deg,#0969da,#1f75cb); color:#fff; box-shadow:0 2px 8px rgba(9,105,218,0.22); }
.sb-suspend  { background:rgba(154,103,0,0.10); border:1px solid rgba(154,103,0,0.28); color:#7d4e00; }
.sb-delete   { background:rgba(207,34,46,0.08); border:1px solid rgba(207,34,46,0.22); color:#82071e; }
.sb-copy     { background:rgba(9,105,218,0.08); border:1px solid rgba(9,105,218,0.22); color:#0969da; }
.sb-copy.cp  { background:rgba(45,164,78,0.10); border-color:rgba(45,164,78,0.28); color:#116329; }
.sb-gen      { background:linear-gradient(135deg,#0969da,#8250df); color:#fff; box-shadow:0 3px 10px rgba(9,105,218,0.28); padding:9px 18px; font-size:13px; border-radius:8px; align-self:flex-end; }
.sb-sm       { padding:4px 9px; font-size:10.5px; }

/* Debug notice */
.sa-debug { background:rgba(45,164,78,0.06); border:1px solid rgba(45,164,78,0.25); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:12px; color:#116329; display:flex; align-items:center; gap:8px; }

/* Search */
.sa-search { display:flex; align-items:center; gap:9px; margin-bottom:14px; flex-wrap:wrap; }
.sa-si { font-family:'Sora',sans-serif; font-size:13px; background:#fff; border:1px solid #d0d7de; border-radius:8px; padding:8px 12px; color:#0d1117; outline:none; flex:1; min-width:160px; }
.sa-si:focus { border-color:#0969da; box-shadow:0 0 0 3px rgba(9,105,218,0.09); }
.sa-fc { font-family:'Sora',sans-serif; font-size:12px; font-weight:600; padding:7px 13px; border-radius:8px; border:1px solid #d0d7de; background:#fff; color:#656d76; cursor:pointer; transition:all 0.14s; }
.sa-fc.on { background:#0969da; color:#fff; border-color:#0969da; }
.sa-fc:hover { border-color:#0969da; }

/* Empty */
.sa-empty { text-align:center; padding:40px 20px; color:#8c959f; }
.sa-empty-i { font-size:34px; opacity:0.25; margin-bottom:10px; }
.sa-empty-t { font-size:14px; font-weight:600; }

/* Company cards grid */
.sa-cards { display:flex; flex-direction:column; gap:13px; }

/* Staff list card */
.sa-staff { background:#fff; border:1px solid #d0d7de; border-radius:12px; padding:16px 18px; }
`;

if (typeof document !== "undefined" && !document.getElementById("sa-css")) {
  const s = document.createElement("style"); s.id = "sa-css"; s.textContent = CSS;
  document.head.appendChild(s);
}

/* ─────────────────────────── HELPERS ────────────────────────────────────── */
const norm = e => String(e || "").trim().toLowerCase();
const ini  = u => (u.name || u.email || "?")[0].toUpperCase();

function avCls(u) {
  if (u.status === "approved") return u.role === "admin" ? "av-a" : "av-t";
  if (u.status === "rejected") return "av-r";
  return "av-p";
}

function pillCls(status) {
  return status === "approved" ? "pill-approved" :
         status === "rejected" ? "pill-rejected"  : "pill-pending";
}

/* ══════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function SuperAdminPanel() {
  const [refresh, setRefresh] = useState(0);
  const [copied,  setCopied]  = useState(null);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("all");
  const [tacLabel,setTacLabel]= useState("");

  const bump = () => setRefresh(r => r + 1);

  // Pull users/tenants/TAC/allocations from backend so this page works on every laptop.
  useEffect(() => {
    hydratePortalState().then(bump).catch(() => {});
  }, []);

  // Push current local state once after page loads; this preserves your existing local logic.
  useEffect(() => {
    syncLocalPortalState().catch(() => {});
  }, [refresh]);

  /* ── Data ── */
  const allUsers = getAllUsers();
  const tenants  = getAllTenants();
  const tacCodes = getAllTenantAccessCodes();

  const internalUsers      = allUsers.filter(u => !u.tenantId && u.role !== "superadmin");
  const pendingInternal    = internalUsers.filter(u => u.status === "pending");
  const pendingClientAdmins= allUsers.filter(u => u.role === "admin" && u.tenantId && u.status === "pending");
  const totalPending       = pendingInternal.length + pendingClientAdmins.length;

  const tacList = useMemo(() =>
    Object.values(tacCodes).sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||"")),
    [tacCodes, refresh]
  );

  const tenantList = useMemo(() => {
  const tenantMap = { ...(tenants || {}) };

  // ✅ Add tenant/company also from approved admins/secondary admins
  allUsers
    .filter(u => u.role === "admin" && u.tenantId)
    .forEach(u => {
      if (!tenantMap[u.tenantId]) {
        tenantMap[u.tenantId] = {
          tenantId: u.tenantId,
          subTenantId: u.subTenantId || u.tenantId,
          name: u.orgName || u.tenantId,
          adminEmail: u.email,
          adminAccessCode: u.adminAccessCode || "",
          active: u.status === "approved",
          createdAt: u.registeredAt || u.createdAt || "",
        };
      } else {
        tenantMap[u.tenantId] = {
          ...tenantMap[u.tenantId],
          tenantId: tenantMap[u.tenantId].tenantId || u.tenantId,
          name: tenantMap[u.tenantId].name || u.orgName || u.tenantId,
          adminEmail: tenantMap[u.tenantId].adminEmail || u.email,
          adminAccessCode:
            tenantMap[u.tenantId].adminAccessCode || u.adminAccessCode || "",
          active:
            tenantMap[u.tenantId].active !== undefined
              ? tenantMap[u.tenantId].active
              : u.status === "approved",
        };
      }
    });

  let list = Object.values(tenantMap);

  if (filter === "active") list = list.filter(t => t.active);
  if (filter === "inactive") list = list.filter(t => !t.active);

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(t =>
      (t.name || "").toLowerCase().includes(q) ||
      (t.adminEmail || "").toLowerCase().includes(q) ||
      (t.tenantId || "").toLowerCase().includes(q)
    );
  }

  return list;
}, [tenants, allUsers, filter, search, refresh]);

  const usersIn = tid => allUsers.filter(u => u.tenantId === tid);

  /* ── Copy ── */
  const copy = (text, id) => {
    navigator.clipboard.writeText(text).catch(()=>{});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  /* ── TAC ── (KEY FIX: store code in UPPERCASE so validateTenantAccessCode finds it) */
  const genTAC = () => {
    const label = tacLabel.trim() || "client";

    /* 
      FIX: generateTenantAccessCode returns mixed-case like "TAC-client-AB12CD"
      We force UPPERCASE so the key stored in localStorage matches exactly
      what validateTenantAccessCode looks up with .toUpperCase()
    */
    const rawCode = generateTenantAccessCode(label);
    const code    = rawCode.toUpperCase(); // ← THE FIX

    saveTenantAccessCode(code, {
      label,
      code,
      createdAt: new Date().toLocaleString("en-IN"),
      used: false,
    });

    setTacLabel("");
    bump();

    /* Auto-copy the new code */
    setTimeout(() => {
      navigator.clipboard.writeText(code).catch(()=>{});
      setCopied(code);
      setTimeout(() => setCopied(null), 3000);
    }, 100);
  };

  const delTAC = code => {
    if (!window.confirm(`Delete code "${code}"?`)) return;
    deleteTenantAccessCode(code); bump();
  };

  /* ── Approvals ── */
  const doApproveAdmin    = e => { approveClientAdmin(e);    bump(); };
  const doApproveInternal = e => { approveInternalStaff(e); bump(); };
  const doApproveTeam     = e => { approveClientTeam(e);    bump(); };
  const doRevoke          = e => { revokeUser(e);            bump(); };
  const doReject          = e => { rejectUser(e);            bump(); };

  const toggleActive = (tid, active) => {
    const t = getAllTenants();
    if (t[tid]) { t[tid].active = active; localStorage.setItem("tenants", JSON.stringify(t)); syncLocalPortalState().catch(() => {}); }
    bump();
  };

  const delTenant = (tid, name) => {
    if (!window.confirm(`Delete "${name}"? The org record will be removed.`)) return;
    deleteTenant(tid); bump();
  };

  /* ── Stats ── */
  const activeOrgs  = Object.values(tenants).filter(t => t.active).length;
  const totalClients= Object.keys(tenants).length;
  const unusedTACs  = tacList.filter(c => !c.used).length;

  /* ── Check for any old lowercase codes (migration helper) ── */
  const hasLegacyCodes = tacList.some(c => c.code !== c.code.toUpperCase());

  /* ── Migrate old lowercase codes ── */
  const migrateLegacyCodes = () => {
    const codes = getAllTenantAccessCodes();
    const migrated = {};
    let count = 0;
    Object.entries(codes).forEach(([key, val]) => {
      const upperKey = key.toUpperCase();
      migrated[upperKey] = { ...val, code: upperKey };
      if (upperKey !== key) count++;
    });
    localStorage.setItem("tenantAccessCodes", JSON.stringify(migrated));
    syncLocalPortalState().catch(() => {});
    bump();
    alert(`Migrated ${count} code(s) to uppercase. They should now work correctly.`);
  };

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  return (
    <div className="sa">
      <div className="sa-title">🌐 Super Admin Console</div>
      <div className="sa-sub">
        <span style={{width:7,height:7,borderRadius:"50%",background:"#2da44e",display:"inline-block",boxShadow:"0 0 0 3px rgba(45,164,78,0.20)"}}/>
        Full platform control
      </div>

      {/* Stats */}
      <div className="sa-stats">
        {[
          {l:"Active Companies", v:activeOrgs,          c:"sv-blue"},
          {l:"Total Companies",  v:totalClients,        c:""},
          {l:"Your Staff",       v:internalUsers.length,c:"sv-purple"},
          {l:"Unused TAC Codes", v:unusedTACs,          c:unusedTACs>0?"sv-green":""},
          {l:"Pending Approvals",v:totalPending,        c:totalPending>0?"sv-amber":"sv-green"},
        ].map(s=>(
          <div key={s.l} className="sa-stat">
            <div className="sa-stat-l">{s.l}</div>
            <div className={`sa-stat-v ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Pending banner */}
      {totalPending > 0 && (
        <div className="sa-alert">
          <span style={{fontSize:20}}>⏳</span>
          <div>
            <div className="sa-alert-t">{totalPending} pending approval{totalPending>1?"s":""}</div>
            <div className="sa-alert-s">
              {pendingClientAdmins.length>0 && `${pendingClientAdmins.length} company admin${pendingClientAdmins.length>1?"s":""} waiting. `}
              {pendingInternal.length>0     && `${pendingInternal.length} staff member${pendingInternal.length>1?"s":""} waiting.`}
            </div>
          </div>
        </div>
      )}

      {/* Legacy code migration notice */}
      {hasLegacyCodes && (
        <div className="sa-debug">
          <span>⚠️</span>
          <div style={{flex:1}}>
            <strong>Old TAC codes detected</strong> — some codes were stored in mixed-case and may not work for login.
            Click to fix them automatically.
          </div>
          <button className="sa-btn sb-approve" onClick={migrateLegacyCodes}>
            🔧 Fix Old Codes
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SECTION 1: TAC CODE GENERATOR
      ══════════════════════════════════════════════════════ */}
      <div className="sa-sec">
        <div className="sa-sec-h">
          🔑 Step 1 — Generate Tenant Access Codes
          <span className="sa-sec-note">to give client companies access to register</span>
        </div>

        <div className="sa-tac">
          <div className="sa-tac-head">
            <span className="sa-tac-head-icon">🏢</span>
            <div>
              <div className="sa-tac-head-t">Tenant Access Codes (TAC)</div>
              <div className="sa-tac-head-s">
                Generate a code → copy it → send to the client company → they register with it → you approve
              </div>
            </div>
          </div>

          <div className="sa-tac-body">
            {/* Generate form */}
            <div className="sa-tac-form">
              <div className="sa-tac-f">
                <label className="sa-tac-l">Client Company Label (optional)</label>
                <input
                  className="sa-tac-i"
                  placeholder="e.g. Acme, HDFC Bank, Infosys…"
                  value={tacLabel}
                  onChange={e => setTacLabel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && genTAC()}
                />
              </div>
              <button className="sa-btn sb-gen" onClick={genTAC}>
                ✦ Generate &amp; Copy Code
              </button>
            </div>

            {/* Code list */}
            {tacList.length === 0 ? (
              <div className="sa-tac-empty">
                No codes yet. Generate your first code above, then send it to a client company.
              </div>
            ) : (
              <div className="sa-tac-list">
                {tacList.map(entry => (
                  <div key={entry.code} className={`sa-tac-row ${entry.used?"used":""}`}>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="sa-tac-code">{entry.code}</div>
                      <div className="sa-tac-meta">
                        {entry.label && <span style={{marginRight:8}}>For: <strong>{entry.label}</strong></span>}
                        Created: {entry.createdAt}
                        {entry.used && <span style={{marginLeft:8,color:"#2da44e"}}>✓ Used by: {entry.usedBy}</span>}
                      </div>
                    </div>
                    {entry.used
                      ? <span className="sa-tac-used">✓ Used</span>
                      : <>
                          <button
                            className={`sa-btn sb-copy ${copied===entry.code?"cp":""}`}
                            onClick={() => copy(entry.code, entry.code)}>
                            {copied===entry.code ? "✓ Copied!" : "📋 Copy"}
                          </button>
                          <button className="sa-btn sb-delete sb-sm" onClick={()=>delTAC(entry.code)}>🗑</button>
                        </>
                    }
                  </div>
                ))}
              </div>
            )}

            {/* Instructions */}
            <div className="sa-tac-hint">
              <strong>How to onboard a new client company:</strong>
              <ol>
                <li>Enter a label (e.g. company name) and click <strong>Generate &amp; Copy Code</strong></li>
                <li>The code is auto-copied. Send it to the client by email/WhatsApp</li>
                <li>Client goes to Login → <strong>Company Access → Register Company</strong> → enters the code</li>
                <li>They appear below under "Client Companies" with status <em>Pending</em></li>
                <li>Click <strong>✓ Approve</strong> to activate their account</li>
                <li>They can then sign in and invite their team members</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          SECTION 2: YOUR INTERNAL STAFF
      ══════════════════════════════════════════════════════ */}
      <div className="sa-sec">
        <div className="sa-sec-h">
          👤 Your Internal Staff
          {internalUsers.length > 0 && <span className="sa-sec-badge">{internalUsers.length}</span>}
          {pendingInternal.length > 0 && (
            <span style={{fontSize:11,fontWeight:700,color:"#9a6700",background:"rgba(154,103,0,0.09)",border:"1px solid rgba(154,103,0,0.25)",borderRadius:99,padding:"2px 9px"}}>
              {pendingInternal.length} pending
            </span>
          )}
        </div>

        <div className="sa-staff">
          {internalUsers.length === 0 ? (
            <div style={{fontSize:13,color:"#8c959f",fontStyle:"italic"}}>
              No internal staff yet. They register via <strong>"Join as Staff"</strong> on the login page.
            </div>
          ) : (
            internalUsers.map(u => (
              <div key={u.email} className="sa-ur">
                <div className={`sa-av ${avCls(u)}`}>{ini(u)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="sa-un">{u.name||"—"}</div>
                  <div className="sa-ue">{u.email}</div>
                  {u.registeredAt && <div className="sa-um">Registered: {u.registeredAt}</div>}
                </div>
                <span className={`pill ${pillCls(u.status)}`}>{u.status}</span>
                <div className="sa-acts">
                  {u.status==="pending"  && <button className="sa-btn sb-approve" onClick={()=>doApproveInternal(u.email)}>✓ Approve</button>}
                  {u.status==="approved" && <button className="sa-btn sb-revoke"  onClick={()=>doRevoke(u.email)}>↩ Revoke</button>}
                  {u.status==="rejected" && <button className="sa-btn sb-approve" onClick={()=>doApproveInternal(u.email)}>✓ Re-approve</button>}
                  <button className="sa-btn sb-reject" onClick={()=>doReject(u.email)}>✕</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          SECTION 3: CLIENT COMPANIES
      ══════════════════════════════════════════════════════ */}
      <div className="sa-sec">
        <div className="sa-sec-h">
          🏢 Client Companies
          {Object.keys(tenants).length > 0 && <span className="sa-sec-badge">{Object.keys(tenants).length}</span>}
          {pendingClientAdmins.length > 0 && (
            <span style={{fontSize:11,fontWeight:700,color:"#9a6700",background:"rgba(154,103,0,0.09)",border:"1px solid rgba(154,103,0,0.25)",borderRadius:99,padding:"2px 9px"}}>
              {pendingClientAdmins.length} pending approval
            </span>
          )}
        </div>

        {/* Search / filter */}
        <div className="sa-search">
          <input
            className="sa-si"
            placeholder="Search by company name, admin email, or ID…"
            value={search}
            onChange={e=>setSearch(e.target.value)}
          />
          {["all","active","inactive"].map(f=>(
            <button key={f} className={`sa-fc ${filter===f?"on":""}`} onClick={()=>setFilter(f)}>
              {f==="all"?"All":f==="active"?"✅ Active":"⏳ Inactive"}
            </button>
          ))}
        </div>

        {tenantList.length === 0 ? (
          <div className="sa-empty">
            <div className="sa-empty-i">🏢</div>
            <div className="sa-empty-t">
              {search.trim()
                ? `No companies matching "${search}"`
                : "No companies registered yet. Generate a TAC code above and send it to a client."}
            </div>
          </div>
        ) : (
          <div className="sa-cards">
            {tenantList.map(tenant => {
              const members  = usersIn(tenant.tenantId);
              const adminUser= members.find(u => u.role==="admin" && norm(u.email)===norm(tenant.adminEmail||""));
              const teamUsers= members.filter(u => u.role==="team");

              return (
                <div key={tenant.tenantId} className="sa-card">
                  {/* Head */}
                  <div className="sa-card-h">
                    <div className="sa-card-icon">🏢</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="sa-card-name">{tenant.name}</div>
                      <div className="sa-card-id">ID: {tenant.tenantId}</div>
                      <div className="sa-card-meta">Created: {tenant.createdAt}</div>
                    </div>
                    <span className={`pill ${tenant.active?"pill-active":"pill-inactive"}`}>
                      {tenant.active?"✅ Active":"⏳ Pending"}
                    </span>
                    <div className="sa-acts">
                      {tenant.active
                        ? <button className="sa-btn sb-suspend" onClick={()=>toggleActive(tenant.tenantId,false)}>🔒 Suspend</button>
                        : <button className="sa-btn sb-activate" onClick={()=>toggleActive(tenant.tenantId,true)}>✅ Activate</button>
                      }
                      <button className="sa-btn sb-delete sb-sm" onClick={()=>delTenant(tenant.tenantId,tenant.name)}>🗑</button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="sa-card-b">

                    {/* Org ID */}
                    <div>
                      <div className="sa-ul">🌐 Organisation ID</div>
                      <div className="sa-inv-row">
                        <div className="sa-inv-code">{tenant.tenantId}</div>
                        <button
                          className={`sa-btn sb-copy sb-sm ${copied===tenant.tenantId?"cp":""}`}
                          onClick={()=>copy(tenant.tenantId,tenant.tenantId)}>
                          {copied===tenant.tenantId?"✓":"📋"}
                        </button>
                      </div>
                    </div>

                    <div className="sa-div"/>

                    {/* Company Admin */}
                    {adminUser ? (
                      <div>
                        <div className="sa-ul">👑 Company Admin</div>
                        <div className="sa-ur">
                          <div className={`sa-av ${avCls(adminUser)}`}>{ini(adminUser)}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div className="sa-un">{adminUser.name||"—"}</div>
                            <div className="sa-ue">{adminUser.email}</div>
                            {adminUser.adminAccessCode && (
                              <div className="sa-acode">
                                <span className="sa-acode-l">Team Code:</span>
                                <span className="sa-acode-v">{adminUser.adminAccessCode}</span>
                                <button
                                  className={`sa-btn sb-copy sb-sm ${copied===`ac-${adminUser.email}`?"cp":""}`}
                                  onClick={()=>copy(adminUser.adminAccessCode,`ac-${adminUser.email}`)}>
                                  {copied===`ac-${adminUser.email}`?"✓":"📋"}
                                </button>
                              </div>
                            )}
                            {adminUser.registeredAt && <div className="sa-um">Registered: {adminUser.registeredAt}</div>}
                          </div>
                          <span className={`pill ${pillCls(adminUser.status)}`}>{adminUser.status}</span>
                          <div className="sa-acts">
                            {adminUser.status==="pending"  && <button className="sa-btn sb-approve" onClick={()=>doApproveAdmin(adminUser.email)}>✓ Approve</button>}
                            {adminUser.status==="approved" && <button className="sa-btn sb-revoke"  onClick={()=>doRevoke(adminUser.email)}>↩ Revoke</button>}
                            {adminUser.status==="rejected" && <button className="sa-btn sb-approve" onClick={()=>doApproveAdmin(adminUser.email)}>✓ Re-approve</button>}
                            <button className="sa-btn sb-reject" onClick={()=>doReject(adminUser.email)}>✕</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{fontSize:12,color:"#8c959f",fontStyle:"italic"}}>
                        No admin registered yet. Send the company a TAC code to register.
                      </div>
                    )}

                    {/* Team members */}
                    {teamUsers.length > 0 && (
                      <div>
                        <div className="sa-ul">
                          👤 Team Members
                          <span className="sa-ul-ct">{teamUsers.length}</span>
                        </div>
                        {teamUsers.map(u => (
                          <div key={u.email} className="sa-ur">
                            <div className={`sa-av ${avCls(u)}`}>{ini(u)}</div>
                            <div style={{flex:1,minWidth:0}}>
                              <div className="sa-un">{u.name||"—"}</div>
                              <div className="sa-ue">{u.email}</div>
                              {u.ownerAdminEmail && <div className="sa-um">Admin: {u.ownerAdminEmail}</div>}
                            </div>
                            <span className={`pill ${pillCls(u.status)}`}>{u.status}</span>
                            <div className="sa-acts">
                              {u.status==="pending"  && <button className="sa-btn sb-approve" onClick={()=>doApproveTeam(u.email)}>✓ Approve</button>}
                              {u.status==="approved" && <button className="sa-btn sb-revoke"  onClick={()=>doRevoke(u.email)}>↩ Revoke</button>}
                              {u.status==="rejected" && <button className="sa-btn sb-approve" onClick={()=>doApproveTeam(u.email)}>✓ Re-approve</button>}
                              <button className="sa-btn sb-reject" onClick={()=>doReject(u.email)}>✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}