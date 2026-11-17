/**
 * AdminDataView.jsx — FIXED
 *
 * ROOT CAUSE OF 0 RECORDS BUG:
 * loadAllTenantsData() reads from localStorage via getTenantData().
 * Company admin's data lives in MongoDB (not SA's browser localStorage).
 * So all company tenant tabs showed 0.
 *
 * THE FIX:
 * Use the `clientsData` prop passed from App.jsx instead of localStorage.
 * App.jsx already fetches with showAll=true from the DB and passes it here.
 * We just need to read tenantId from each row (row.tenantId) to group by org.
 *
 * For SA "own" data: filter rows where row.tenantId === null (SA's records).
 * For company tenant: filter rows where row.tenantId === that tenant's id.
 * For "All Orgs": show everything in the prop.
 */

import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { isSuperAdmin, getAllTenants, getTenantId } from "../utils/tenantAuth";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');

.adv-root { font-family: 'Plus Jakarta Sans', sans-serif; color: #0f1c3f; }
.adv-view-switcher {
  display: flex; flex-direction: column; gap: 10px;
  background: linear-gradient(135deg, rgba(245,166,35,0.08), rgba(245,166,35,0.03));
  border: 1.5px solid rgba(245,166,35,0.30);
  border-radius: 16px; padding: 16px 20px; margin-bottom: 20px;
}
.adv-sa-banner {
  display: flex; align-items: center; gap: 14px;
  background: linear-gradient(135deg, rgba(245,166,35,0.10), rgba(245,166,35,0.05));
  border: 1.5px solid rgba(245,166,35,0.35);
  border-radius: 14px; padding: 14px 20px; margin-bottom: 20px;
  flex-wrap: wrap;
}
.adv-sa-banner-icon  { font-size: 24px; flex-shrink: 0; }
.adv-sa-banner-title { font-family:'Space Grotesk',sans-serif; font-size:14px; font-weight:700; color:#92400e; }
.adv-sa-banner-sub   { font-size:12px; color:#78350f; margin-top:2px; line-height:1.5; }
.adv-sa-badge {
  margin-left:auto; flex-shrink:0;
  display:inline-flex; align-items:center; gap:5px;
  background:linear-gradient(135deg,rgba(245,166,35,0.18),rgba(245,166,35,0.10));
  border:1px solid rgba(245,166,35,0.40);
  color:#92400e; font-family:'Space Grotesk',sans-serif;
  font-size:11px; font-weight:700; padding:4px 12px; border-radius:99px;
}
.adv-summary {
  display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
  gap:12px; margin-bottom:20px;
}
.adv-stat {
  background:#fff; border:1.5px solid rgba(59,130,246,0.16);
  border-radius:14px; padding:16px 18px;
  box-shadow:0 3px 14px rgba(37,99,235,0.07);
  display:flex; align-items:center; gap:12px;
  transition:transform 0.18s, box-shadow 0.18s;
}
.adv-stat:hover { transform:translateY(-2px); box-shadow:0 6px 22px rgba(37,99,235,0.11); }
.adv-stat-icon  { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0; }
.adv-si-blue   { background:rgba(37,99,235,0.10);  border:1px solid rgba(37,99,235,0.20);  }
.adv-si-green  { background:rgba(16,185,129,0.10); border:1px solid rgba(16,185,129,0.20); }
.adv-si-amber  { background:rgba(245,158,11,0.10); border:1px solid rgba(245,158,11,0.20); }
.adv-si-purple { background:rgba(124,58,237,0.10); border:1px solid rgba(124,58,237,0.20); }
.adv-si-red    { background:rgba(239,68,68,0.10);  border:1px solid rgba(239,68,68,0.20);  }
.adv-si-gold   { background:rgba(245,166,35,0.12); border:1px solid rgba(245,166,35,0.28); }
.adv-stat-label { font-family:'Space Grotesk',sans-serif; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.09em; color:#8ba3c0; margin-bottom:2px; }
.adv-stat-val   { font-family:'Space Grotesk',sans-serif; font-size:24px; font-weight:700; line-height:1.1; }
.adv-sv-blue   { background:linear-gradient(135deg,#2563eb,#06b6d4); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.adv-sv-green  { background:linear-gradient(135deg,#10b981,#34d399); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.adv-sv-amber  { background:linear-gradient(135deg,#f59e0b,#fbbf24); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.adv-sv-purple { background:linear-gradient(135deg,#7c3aed,#a78bfa); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.adv-sv-red    { background:linear-gradient(135deg,#ef4444,#f87171); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.adv-sv-gold   { background:linear-gradient(135deg,#f5a623,#fbbf24); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.adv-section-label {
  font-family:'Space Grotesk',sans-serif; font-size:11px; font-weight:700;
  text-transform:uppercase; letter-spacing:0.09em; color:#8ba3c0;
  margin-bottom:8px; display:flex; align-items:center; gap:7px;
}
.adv-tenant-tabs { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:14px; }
.adv-tenant-tab {
  display:inline-flex; align-items:center; gap:6px;
  background:rgba(245,166,35,0.08); border:1.5px solid rgba(245,166,35,0.25);
  color:#92400e; font-family:'Space Grotesk',sans-serif;
  font-size:12px; font-weight:600; padding:5px 13px; border-radius:99px;
  cursor:pointer; transition:all 0.15s;
}
.adv-tenant-tab:hover { background:rgba(245,166,35,0.15); }
.adv-tenant-tab.active {
  background:linear-gradient(135deg,#f5a623,#fbbf24);
  color:#1a0e00; border-color:transparent;
  box-shadow:0 2px 8px rgba(245,166,35,0.35);
}
.adv-tenant-count { background:rgba(255,255,255,0.30); border-radius:99px; padding:0 5px; font-size:10px; }
.adv-tenant-tab:not(.active) .adv-tenant-count { background:rgba(245,158,11,0.15); }
.adv-client-pills { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:14px; }
.adv-cpill {
  display:inline-flex; align-items:center; gap:5px;
  background:rgba(37,99,235,0.07); border:1.5px solid rgba(37,99,235,0.18);
  color:#2563eb; font-family:'Space Grotesk',sans-serif;
  font-size:12px; font-weight:600; padding:4px 12px; border-radius:99px;
  cursor:pointer; transition:all 0.15s;
}
.adv-cpill:hover { background:rgba(37,99,235,0.13); }
.adv-cpill.active { background:linear-gradient(135deg,#2563eb,#06b6d4); color:#fff; border-color:transparent; box-shadow:0 2px 8px rgba(37,99,235,0.28); }
.adv-cpill-count { background:rgba(255,255,255,0.25); border-radius:99px; padding:0 5px; font-size:10px; }
.adv-cpill:not(.active) .adv-cpill-count { background:rgba(37,99,235,0.10); }

.adv-client-dropdown-wrap {
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  background:#fff; border:1.5px solid rgba(59,130,246,0.16);
  border-radius:14px; padding:12px 16px; box-shadow:0 2px 10px rgba(37,99,235,0.05);
}
.adv-client-select {
  font-family:'Space Grotesk',sans-serif; font-size:13px; font-weight:700;
  background:#f8faff; border:1.5px solid rgba(59,130,246,0.22);
  border-radius:10px; padding:9px 38px 9px 13px; color:#0f1c3f;
  outline:none; cursor:pointer; appearance:none; min-width:300px; max-width:520px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238ba3c0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 13px center; transition:all 0.18s;
}
.adv-client-select:focus { background:#fff; border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,0.09); }
.adv-client-clear {
  font-family:'Space Grotesk',sans-serif; font-size:12px; font-weight:700;
  color:#2563eb; border:1.5px solid rgba(37,99,235,0.22); background:rgba(37,99,235,0.06);
  border-radius:99px; padding:7px 13px; cursor:pointer; transition:all 0.15s;
}
.adv-client-clear:hover { background:rgba(37,99,235,0.12); transform:translateY(-1px); }
.adv-controls {
  display:flex; flex-wrap:wrap; gap:10px; align-items:center;
  background:#fff; border:1.5px solid rgba(59,130,246,0.16);
  border-radius:14px; padding:14px 18px; margin-bottom:16px;
  box-shadow:0 2px 10px rgba(37,99,235,0.05);
}
.adv-search-wrap { position:relative; display:inline-flex; align-items:center; }
.adv-search-ico  { position:absolute; left:11px; font-size:14px; color:#8ba3c0; pointer-events:none; }
.adv-input {
  font-family:'Plus Jakarta Sans',sans-serif; font-size:13.5px;
  background:#f8faff; border:1.5px solid rgba(59,130,246,0.16);
  border-radius:9px; padding:8px 13px; color:#0f1c3f; outline:none; transition:all 0.18s;
}
.adv-input:focus { background:#fff; border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,0.09); }
.adv-input::placeholder { color:#8ba3c0; }
.adv-search-wrap .adv-input { padding-left:33px; width:220px; }
.adv-select {
  appearance:none; cursor:pointer; padding-right:28px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238ba3c0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 10px center;
}
.adv-divider { width:1px; height:26px; background:rgba(59,130,246,0.14); margin:0 2px; }
.adv-btn {
  font-family:'Space Grotesk',sans-serif; font-size:12.5px; font-weight:700;
  border:none; border-radius:9px; padding:8px 16px;
  cursor:pointer; display:inline-flex; align-items:center; gap:6px;
  transition:all 0.18s; white-space:nowrap;
}
.adv-btn:hover { transform:translateY(-1px); filter:brightness(1.06); }
.adv-btn:active { transform:scale(0.97); }
.adv-btn-green { background:linear-gradient(135deg,#10b981,#34d399); color:#001a0d; box-shadow:0 3px 10px rgba(16,185,129,0.22); }
.adv-count-pill {
  display:inline-flex; align-items:center;
  background:rgba(37,99,235,0.08); border:1px solid rgba(37,99,235,0.20);
  color:#2563eb; font-family:'Space Grotesk',sans-serif;
  font-size:12px; font-weight:700; padding:3px 11px; border-radius:99px; margin-left:auto;
}
.adv-table-wrap { background:#fff; border:1.5px solid rgba(59,130,246,0.16); border-radius:16px; overflow:hidden; box-shadow:0 4px 22px rgba(37,99,235,0.08); }
.adv-scroll { max-height:540px; overflow-y:auto; overflow-x:auto; }
.adv-scroll::-webkit-scrollbar { width:7px; height:7px; }
.adv-scroll::-webkit-scrollbar-track { background:#f0f6ff; }
.adv-scroll::-webkit-scrollbar-thumb { background:rgba(37,99,235,0.22); border-radius:99px; }
.adv-table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
.adv-thead tr { background:linear-gradient(135deg,#1d4ed8 0%,#0891b2 100%); }
.adv-th {
  font-family:'Space Grotesk',sans-serif; font-size:10.5px; font-weight:600;
  text-transform:uppercase; letter-spacing:0.09em; color:rgba(255,255,255,0.82);
  padding:13px 15px; text-align:left; white-space:nowrap;
  border-right:1px solid rgba(255,255,255,0.10);
  position:sticky; top:0; z-index:10;
  background:linear-gradient(135deg,#1d4ed8 0%,#0891b2 100%);
}
.adv-th:last-child { border-right:none; }
.adv-th-gold { background:linear-gradient(135deg,#b45309,#d97706) !important; }
.adv-tr { border-bottom:1px solid rgba(59,130,246,0.08); transition:background 0.12s; }
.adv-tr:last-child { border-bottom:none; }
.adv-tr:hover { background:#eef4ff !important; }
.adv-tr:nth-child(even) { background:#f8faff; }
.adv-td { padding:10px 15px; color:#0f1c3f; vertical-align:middle; white-space:nowrap; border-right:1px solid rgba(59,130,246,0.07); overflow:hidden; max-width:220px; text-overflow:ellipsis; }
.adv-td:last-child { border-right:none; }
.adv-tenant-badge {
  display:inline-flex; align-items:center;
  background:rgba(245,166,35,0.10); border:1px solid rgba(245,166,35,0.30);
  color:#92400e; font-family:'Space Grotesk',sans-serif;
  font-size:11px; font-weight:700; padding:3px 10px; border-radius:99px;
}
.adv-client-badge {
  display:inline-flex; align-items:center;
  background:rgba(37,99,235,0.08); border:1px solid rgba(37,99,235,0.20);
  color:#2563eb; font-family:'Space Grotesk',sans-serif;
  font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:99px;
}
.adv-status { display:inline-flex; align-items:center; gap:4px; font-family:'Space Grotesk',sans-serif; font-size:11px; font-weight:700; padding:3px 10px; border-radius:99px; text-transform:uppercase; letter-spacing:0.04em; }
.adv-s-sent    { background:rgba(16,185,129,0.10); border:1px solid rgba(16,185,129,0.25); color:#059669; }
.adv-s-pending { background:rgba(245,158,11,0.10); border:1px solid rgba(245,158,11,0.25); color:#b45309; }
.adv-s-insuff  { background:rgba(124,58,237,0.10); border:1px solid rgba(124,58,237,0.25); color:#6d28d9; }
.adv-s-closed  { background:rgba(37,99,235,0.10);  border:1px solid rgba(37,99,235,0.25);  color:#1d4ed8; }
.adv-s-hold    { background:rgba(239,68,68,0.10);  border:1px solid rgba(239,68,68,0.25);  color:#b91c1c; }
.adv-s-other   { background:rgba(100,116,139,0.10); border:1px solid rgba(100,116,139,0.20); color:#475569; }
.adv-row-num { font-family:'Space Grotesk',sans-serif; font-size:11px; font-weight:600; color:#8ba3c0; background:rgba(59,130,246,0.06); border-radius:5px; padding:2px 7px; display:inline-block; }
.adv-empty { text-align:center; padding:64px 24px; color:#8ba3c0; }
.adv-empty-icon { font-size:40px; opacity:0.25; margin-bottom:12px; }
.adv-empty-text { font-family:'Space Grotesk',sans-serif; font-size:15px; font-weight:600; }
.adv-empty-sub  { font-size:13px; margin-top:5px; opacity:0.75; }
.adv-loading { display:flex; align-items:center; justify-content:center; gap:10px; padding:48px 24px; color:#2563eb; font-family:'Space Grotesk',sans-serif; font-size:13px; font-weight:600; }
.adv-loading-spin { width:18px; height:18px; border-radius:50%; border:2px solid rgba(37,99,235,0.20); border-top-color:#2563eb; animation:advspin 0.7s linear infinite; }
@keyframes advspin { to { transform:rotate(360deg); } }
.adv-footer {
  display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;
  background:linear-gradient(135deg,rgba(37,99,235,0.06),rgba(6,182,212,0.04));
  border:1.5px solid rgba(37,99,235,0.14); border-radius:14px;
  padding:16px 24px; margin-top:14px;
  box-shadow:0 2px 10px rgba(37,99,235,0.06);
}
.adv-footer-item { text-align:center; }
.adv-footer-label { font-family:'Space Grotesk',sans-serif; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.09em; color:#8ba3c0; margin-bottom:2px; }
.adv-footer-val   { font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:700; background:linear-gradient(135deg,#2563eb,#06b6d4); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
`;

if (typeof document !== "undefined" && !document.getElementById("adv-css")) {
  const s = document.createElement("style");
  s.id = "adv-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

const SUPER_ADMIN_EMAIL = "superadmin@tervies.com";

function getStatusClass(s) {
  const v = (s || "").toLowerCase();
  if (v === "sent")                 return "adv-s-sent";
  if (v === "pending")              return "adv-s-pending";
  if (v === "insuff")               return "adv-s-insuff";
  if (v === "closed")               return "adv-s-closed";
  if (v === "hold" || v === "stop") return "adv-s-hold";
  return "adv-s-other";
}

function fmtCell(val) {
  if (val === undefined || val === null || val === "") return "—";
  return String(val).replace(/[\r\n]+/g, " ").trim();
}

function getClientName(row) {
  return (
    row["clientName"] || row["Client Name"] || row["client_name"] ||
    row["Company Name"] || row["company_name"] ||
    row["client"] || row["Client"] ||
    (row.rawData && typeof row.rawData === "object" && (
      row.rawData["Client Name"] || row.rawData["Company Name"] ||
      row.rawData["client"] || row.rawData["Client"]
    )) || ""
  ).toString().trim();
}

/* ══════════════════════════════════════════════════════════════════
   buildFlatRows — converts clientsData prop into flat row array
   
   clientsData comes from App.jsx allTenantsData which is fetched
   from DB with showAll=true. Each row already has row.tenantId set
   by the backend (flattenRecord adds it).
   
   We derive orgName from the tenants registry using row.tenantId.
   SA's own records have tenantId=null → orgName = "Platform (SA)".
══════════════════════════════════════════════════════════════════ */
function buildFlatRows(clientsData, tenantRegistry) {
  const MASTER = "__MASTER_TABLE__";
  const rows   = [];
  let   rowNum = 0;

  Object.entries(clientsData).forEach(([clientKey, records]) => {
    if (clientKey === MASTER) return;
    if (!Array.isArray(records)) return;
    records.forEach(row => {
      rowNum++;
      const tid     = row.tenantId ?? row["tenantId"] ?? null;
      const orgName = tid
        ? (tenantRegistry[tid]?.name || tid)
        : "Platform (SA)";
      const clientName = getClientName(row) || clientKey || "Unknown";

      rows.push({
        _rowNum:     rowNum,
        _tenantId:   tid,
        _orgName:    orgName,
        _clientName: clientName,
        ...row,
      });
    });
  });

  return rows;
}

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════ */
export default function AdminDataView({ clientsData = {}, currentUser = {} }) {
  const SA         = isSuperAdmin(currentUser);
  const myTenantId = getTenantId(currentUser);

  const tenantRegistry = useMemo(() => getAllTenants(), []);

  /* ── "All Orgs" / "My Data" / "<tenantId>" ── */
  const [viewMode,     setViewMode]     = useState("all");
  const [search,       setSearch]       = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const switchViewMode = (mode) => {
    setViewMode(mode);
    setTenantFilter("all");
    setClientFilter("all");
    setSearch("");
  };

  /* ══════════════════════════════════════════════════════════════
     Build flat rows from the DB-fetched clientsData prop.
     No more localStorage reads — data comes from MongoDB via prop.
  ══════════════════════════════════════════════════════════════ */
  const allFlatRows = useMemo(() =>
    buildFlatRows(clientsData, tenantRegistry),
  [clientsData, tenantRegistry]);

  /* ── Distinct tenants found in the data ── */
  const tenantMap = useMemo(() => {
    const map = {}; // tenantId → { id, name, count }
    allFlatRows.forEach(r => {
      const tid  = r._tenantId ?? "null";
      const name = r._orgName  || "Platform (SA)";
      if (!map[tid]) map[tid] = { id: r._tenantId, name, count: 0 };
      map[tid].count++;
    });
    return map;
  }, [allFlatRows]);

  const tenantList = useMemo(() =>
    Object.values(tenantMap).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
  [tenantMap]);

  /* ── Rows scoped to viewMode ── */
  const scopedRows = useMemo(() => {
    if (!SA) return allFlatRows;
    if (viewMode === "all")  return allFlatRows;
    if (viewMode === "own")  return allFlatRows.filter(r => r._tenantId === myTenantId);
    // specific tenant
    return allFlatRows.filter(r => {
      // tenantId can be null (stored as null in DB) — compare correctly
      if (viewMode === "null" || viewMode === null) return r._tenantId == null;
      return r._tenantId === viewMode;
    });
  }, [allFlatRows, SA, viewMode, myTenantId]);

  /* ── Client list for the current scope ── */
  const clientList = useMemo(() => {
    const map = {};
    const rows = SA && viewMode === "all" && tenantFilter !== "all"
      ? scopedRows.filter(r => String(r._tenantId ?? "null") === tenantFilter)
      : scopedRows;
    rows.forEach(r => {
      const key = `${r._tenantId ?? "null"}__${r._clientName}`;
      if (!map[key]) map[key] = { key, clientName: r._clientName, tenantId: r._tenantId, orgName: r._orgName, count: 0 };
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [scopedRows, SA, viewMode, tenantFilter]);

  /* ── Filtered rows ── */
  const filtered = useMemo(() => {
    let rows = scopedRows;

    // Org filter (in "all" mode)
    if (SA && viewMode === "all" && tenantFilter !== "all") {
      const filterTid = tenantFilter === "null" ? null : tenantFilter;
      rows = rows.filter(r => r._tenantId === filterTid || String(r._tenantId ?? "null") === tenantFilter);
    }

    // Client filter
    if (clientFilter !== "all") {
      const [tidPart, cName] = clientFilter.split("__CSPLIT__");
      rows = rows.filter(r => {
        const rowTid = String(r._tenantId ?? "null");
        return r._clientName === cName && rowTid === tidPart;
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      rows = rows.filter(r =>
        (r.Status || r.status || "Pending").toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // Search
    if (search.trim()) {
      const sl = search.toLowerCase();
      rows = rows.filter(r =>
        Object.entries(r).some(([k, v]) =>
          !k.startsWith("_") && v && typeof v !== "object" && String(v).toLowerCase().includes(sl)
        )
      );
    }

    return rows;
  }, [scopedRows, SA, viewMode, tenantFilter, clientFilter, statusFilter, search]);

  /* ── Stats ── */
  const stats = useMemo(() => ({
    total:   scopedRows.length,
    orgs:    tenantList.length,
    clients: clientList.length,
    sent:    scopedRows.filter(r => (r.Status || r.status || "") === "Sent").length,
    pending: scopedRows.filter(r => { const s = r.Status || r.status || "Pending"; return s === "Pending"; }).length,
    insuff:  scopedRows.filter(r => (r.Status || r.status || "") === "Insuff").length,
  }), [scopedRows, tenantList, clientList]);

  /* ── Show org column only in SA "all" view ── */
  const showOrgCol = SA && viewMode === "all";

  const COLS = [
    { key: "_rowNum",                label: "#"         },
    ...(showOrgCol ? [{ key: "_orgName", label: "Org" }] : []),
    { key: "_clientName",            label: "Client"    },
    { key: "Candidate Name",         label: "Candidate" },
    { key: "Check Name",             label: "Check"     },
    { key: "Company Name",           label: "Company"   },
    { key: "Status",                 label: "Status"    },
    { key: "Candidate Phone Number", label: "Phone"     },
    { key: "Address",                label: "Address"   },
    { key: "City",                   label: "City"      },
    { key: "State",                  label: "State"     },
    { key: "Assigned Date",          label: "Assigned"  },
    { key: "Completed Date",         label: "Completed" },
    { key: "assignDate",             label: "Sent Date" },
    { key: "Payment Status",         label: "Payment"   },
    { key: "Month",                  label: "Month"     },
  ];

  /* ── Export ── */
  const exportExcel = () => {
    const exportData = filtered.map(row => {
      const obj = {};
      if (showOrgCol) obj["Organisation"] = row._orgName || "—";
      obj["Client"] = row._clientName;
      COLS.forEach(c => {
        if (["_rowNum","_orgName","_clientName"].includes(c.key)) return;
        obj[c.label] = fmtCell(row[c.key]);
      });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "All Records");
    const modeLabel = viewMode === "all" ? "AllOrgs" : viewMode === "own" ? "MyData"
      : (tenantList.find(t => String(t.id ?? "null") === viewMode)?.name || viewMode);
    saveAs(
      new Blob([XLSX.write(wb, { bookType:"xlsx", type:"array" })]),
      `Records_${modeLabel}_${new Date().toLocaleDateString("en-IN").replace(/\//g,"-")}.xlsx`
    );
  };

  /* ── Loading state ── */
  const isLoading = Object.keys(clientsData).length === 0;

  if (isLoading) {
    return (
      <div className="adv-loading">
        <span className="adv-loading-spin"/>
        Loading records from database…
      </div>
    );
  }

  /* ── View mode label ── */
  const activeViewLabel = (() => {
    if (viewMode === "all")  return `Viewing all ${allFlatRows.length.toLocaleString()} records across all organisations`;
    if (viewMode === "own")  return `Viewing your platform data only (${scopedRows.length.toLocaleString()} records)`;
    const org = tenantList.find(t => String(t.id ?? "null") === viewMode);
    return `Viewing data for: ${org?.name || viewMode} (${scopedRows.length.toLocaleString()} records)`;
  })();

  /* ── Tenant button helper ── */
  const tenantBtnStyle = (tid) => {
    const tidStr  = String(tid ?? "null");
    const isOwn   = viewMode === "own"  && (tid === myTenantId || tid == null);
    const isActive = viewMode === tidStr || (viewMode === "own" && tid === myTenantId);
    const isNull  = tid == null;
    if (isNull) {
      return {
        border:     viewMode === "own" ? "1.5px solid transparent" : "1.5px solid rgba(16,185,129,0.28)",
        background: viewMode === "own" ? "linear-gradient(135deg,#059669,#34d399)" : "rgba(16,185,129,0.08)",
        color:      viewMode === "own" ? "#001a0d" : "#059669",
        boxShadow:  viewMode === "own" ? "0 3px 12px rgba(16,185,129,0.28)" : "none",
      };
    }
    return {
      border:     isActive ? "1.5px solid transparent" : "1.5px solid rgba(245,166,35,0.30)",
      background: isActive ? "linear-gradient(135deg,#f5a623,#fbbf24)" : "rgba(245,158,11,0.08)",
      color:      isActive ? "#1a0e00" : "#92400e",
      boxShadow:  isActive ? "0 3px 12px rgba(245,166,35,0.32)" : "none",
    };
  };

  /* ════ RENDER ════ */
  return (
    <div className="adv-root">

      {/* ── View Mode Switcher ── */}
      {SA && (
        <div style={{
          display:"flex", flexDirection:"column", gap:10,
          background:"rgba(245,158,11,0.06)", border:"1.5px solid rgba(245,166,35,0.30)",
          borderRadius:16, padding:"16px 20px", marginBottom:20,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.10em", color:"#92400e", flexShrink:0 }}>
              👁 View mode
            </span>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>

              {/* All Orgs */}
              <button onClick={() => switchViewMode("all")} style={{
                display:"inline-flex", alignItems:"center", gap:6,
                fontFamily:"'Space Grotesk',sans-serif", fontSize:13, fontWeight:700,
                padding:"8px 16px", borderRadius:99, cursor:"pointer", transition:"all 0.18s",
                border: viewMode === "all" ? "1.5px solid transparent" : "1.5px solid rgba(37,99,235,0.28)",
                background: viewMode === "all" ? "linear-gradient(135deg,#1d4ed8,#0891b2)" : "rgba(37,99,235,0.08)",
                color: viewMode === "all" ? "#fff" : "#1d4ed8",
                boxShadow: viewMode === "all" ? "0 3px 12px rgba(37,99,235,0.28)" : "none",
              }}>
                🌐 All Orgs
                <span style={{ fontSize:11, fontWeight:800, padding:"2px 7px", borderRadius:99, background: viewMode==="all"?"rgba(255,255,255,0.25)":"rgba(37,99,235,0.12)", color: viewMode==="all"?"#fff":"#1d4ed8" }}>
                  {allFlatRows.length}
                </span>
              </button>

              {/* One button per tenant (including SA's own null-tenant) */}
              {tenantList.map(t => {
                const tidStr  = String(t.id ?? "null");
                const isOwn   = t.id == null; // SA's own records
                const isActive = isOwn ? viewMode === "own" : viewMode === tidStr;
                const style    = tenantBtnStyle(t.id);
                return (
                  <button key={tidStr}
                    onClick={() => isOwn ? switchViewMode("own") : switchViewMode(tidStr)}
                    style={{ display:"inline-flex", alignItems:"center", gap:6, fontFamily:"'Space Grotesk',sans-serif", fontSize:13, fontWeight:700, padding:"8px 16px", borderRadius:99, cursor:"pointer", transition:"all 0.18s", ...style }}>
                    {isOwn ? "🏢" : "🏦"} {t.name}
                    <span style={{ fontSize:11, fontWeight:800, padding:"2px 7px", borderRadius:99, background: isActive?"rgba(255,255,255,0.25)":isOwn?"rgba(16,185,129,0.12)":"rgba(245,158,11,0.15)", color: isActive?(isOwn?"#001a0d":"#1a0e00"):(isOwn?"#059669":"#92400e") }}>
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:7, fontFamily:"'Space Grotesk',sans-serif", fontSize:12, fontWeight:600, color:"#92400e" }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:"#f5a623", display:"inline-block", flexShrink:0, boxShadow:"0 0 0 3px rgba(245,166,35,0.22)" }}/>
            {activeViewLabel}
          </div>
        </div>
      )}

      {/* ── Banner ── */}
      {SA && viewMode === "all" && (
        <div className="adv-sa-banner">
          <span className="adv-sa-banner-icon">👑</span>
          <div>
            <div className="adv-sa-banner-title">Super Admin — Cross-Tenant View</div>
            <div className="adv-sa-banner-sub">
              Seeing ALL records from ALL organisations ({tenantList.length} org{tenantList.length !== 1 ? "s" : ""} · {allFlatRows.length.toLocaleString()} total records).
              This view is <strong>invisible to tenant admins</strong> — they only see their own data.
            </div>
          </div>
          <span className="adv-sa-badge">🔒 Confidential</span>
        </div>
      )}
      {SA && viewMode === "own" && (
        <div className="adv-sa-banner" style={{ borderColor:"rgba(16,185,129,0.35)", background:"linear-gradient(135deg,rgba(16,185,129,0.08),rgba(16,185,129,0.03))" }}>
          <span className="adv-sa-banner-icon">🏢</span>
          <div>
            <div className="adv-sa-banner-title" style={{ color:"#065f46" }}>Platform Data</div>
            <div className="adv-sa-banner-sub" style={{ color:"#064e3b" }}>
              Showing only SA-uploaded records ({scopedRows.length.toLocaleString()} records).
            </div>
          </div>
        </div>
      )}
      {SA && viewMode !== "all" && viewMode !== "own" && (() => {
        const org = tenantList.find(t => String(t.id ?? "null") === viewMode);
        return (
          <div className="adv-sa-banner" style={{ borderColor:"rgba(245,166,35,0.50)", background:"linear-gradient(135deg,rgba(245,166,35,0.10),rgba(245,166,35,0.04))" }}>
            <span className="adv-sa-banner-icon">🔍</span>
            <div>
              <div className="adv-sa-banner-title">Viewing: {org?.name || viewMode}</div>
              <div className="adv-sa-banner-sub" style={{ color:"#78350f" }}>
                You are viewing data belonging to another organisation. {scopedRows.length.toLocaleString()} records found.
              </div>
            </div>
            <span className="adv-sa-badge" style={{ background:"rgba(245,166,35,0.18)", borderColor:"rgba(245,166,35,0.45)", color:"#92400e" }}>
              🏦 {org?.name || viewMode}
            </span>
          </div>
        );
      })()}

      {/* ── Summary cards ── */}
      <div className="adv-summary">
        {[
          { label:"Total Records",  val:stats.total,   icon:"📋", icls:"adv-si-blue",   vcls:"adv-sv-blue"   },
          ...(SA && viewMode === "all" ? [{ label:"Organisations", val:stats.orgs, icon:"🏢", icls:"adv-si-gold", vcls:"adv-sv-gold" }] : []),
          { label:"Clients",        val:stats.clients, icon:"📁", icls:"adv-si-purple", vcls:"adv-sv-purple" },
          { label:"Sent",           val:stats.sent,    icon:"✅", icls:"adv-si-green",  vcls:"adv-sv-green"  },
          { label:"Pending",        val:stats.pending, icon:"⏳", icls:"adv-si-amber",  vcls:"adv-sv-amber"  },
          { label:"Insuff",         val:stats.insuff,  icon:"⚠️", icls:"adv-si-red",    vcls:"adv-sv-red"    },
        ].map(s => (
          <div key={s.label} className="adv-stat">
            <div className={`adv-stat-icon ${s.icls}`}>{s.icon}</div>
            <div>
              <div className="adv-stat-label">{s.label}</div>
              <div className={`adv-stat-val ${s.vcls}`}>{s.val.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Org filter tabs (all mode only) ── */}
      {SA && viewMode === "all" && tenantList.length > 1 && (
        <div style={{ marginBottom:16 }}>
          <div className="adv-section-label">
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#f5a623", display:"inline-block" }}/>
            Filter by Organisation
          </div>
          <div className="adv-tenant-tabs">
            <span className={`adv-tenant-tab ${tenantFilter === "all" ? "active" : ""}`}
              onClick={() => { setTenantFilter("all"); setClientFilter("all"); }}>
              All Orgs <span className="adv-tenant-count">{allFlatRows.length}</span>
            </span>
            {tenantList.map(t => {
              const tidStr = String(t.id ?? "null");
              return (
                <span key={tidStr}
                  className={`adv-tenant-tab ${tenantFilter === tidStr ? "active" : ""}`}
                  onClick={() => { setTenantFilter(tidStr); setClientFilter("all"); }}>
                  🏢 {t.name} <span className="adv-tenant-count">{t.count}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Client filter dropdown ── */}
      {clientList.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div className="adv-section-label">
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#2563eb", display:"inline-block" }}/>
            Filter by Client
          </div>
          <div className="adv-client-dropdown-wrap">
            <select
              className="adv-client-select"
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}>
              <option value="all">All Clients ({scopedRows.length.toLocaleString()})</option>
              {clientList.map(c => {
                const fkey = `${String(c.tenantId ?? "null")}__CSPLIT__${c.clientName}`;
                return (
                  <option key={c.key} value={fkey}>
                    {c.clientName} ({c.count}){SA && viewMode === "all" ? ` · ${c.orgName}` : ""}
                  </option>
                );
              })}
            </select>
            {clientFilter !== "all" && (
              <button className="adv-client-clear" onClick={() => setClientFilter("all")}>✕ Clear</button>
            )}
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      <div className="adv-controls">
        <div className="adv-search-wrap">
          <span className="adv-search-ico">🔍</span>
          <input className="adv-input" placeholder="Search any field…"
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div className="adv-divider"/>
        <select className="adv-input adv-select" style={{ width:140 }}
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="Sent">Sent</option>
          <option value="Pending">Pending</option>
          <option value="Insuff">Insuff</option>
          <option value="Closed">Closed</option>
          <option value="Hold">Hold</option>
          <option value="Stop">Stop</option>
        </select>
        {(search || clientFilter !== "all" || statusFilter !== "all" || tenantFilter !== "all") && (
          <button className="adv-btn"
            style={{ background:"transparent", border:"1.5px solid rgba(59,130,246,0.22)", color:"#2563eb" }}
            onClick={() => { setSearch(""); setClientFilter("all"); setStatusFilter("all"); setTenantFilter("all"); }}>
            ✕ Clear
          </button>
        )}
        <span className="adv-count-pill">{filtered.length.toLocaleString()} rows</span>
        <button className="adv-btn adv-btn-green" style={{ marginLeft:"auto" }} onClick={exportExcel}>
          ↓ Export Excel
        </button>
      </div>

      {/* ── Table ── */}
      <div className="adv-table-wrap">
        <div className="adv-scroll">
          {filtered.length === 0 ? (
            <div className="adv-empty">
              <div className="adv-empty-icon">{scopedRows.length === 0 ? "📂" : "🔍"}</div>
              <div className="adv-empty-text">{scopedRows.length === 0 ? "No records in this view" : "No records match your filters"}</div>
              <div className="adv-empty-sub">{scopedRows.length === 0 ? "No data found for this organisation." : "Try adjusting your search or filters."}</div>
            </div>
          ) : (
            <table className="adv-table">
              <thead className="adv-thead">
                <tr>
                  {COLS.map(c => (
                    <th key={c.key} className={`adv-th ${c.key === "_orgName" ? "adv-th-gold" : ""}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={i} className="adv-tr">
                    {COLS.map(col => {
                      const val = row[col.key];
                      if (col.key === "_rowNum")     return <td key={col.key} className="adv-td"><span className="adv-row-num">{i + 1}</span></td>;
                      if (col.key === "_orgName")    return <td key={col.key} className="adv-td"><span className="adv-tenant-badge">🏢 {val || "—"}</span></td>;
                      if (col.key === "_clientName") return <td key={col.key} className="adv-td"><span className="adv-client-badge">{val || "—"}</span></td>;
                      if (col.key === "Status") {
                        const s = row.Status || row.status || "Pending";
                        return <td key={col.key} className="adv-td"><span className={`adv-status ${getStatusClass(s)}`}>{s}</span></td>;
                      }
                      if (col.key === "Candidate Name") return <td key={col.key} className="adv-td" style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:600 }} title={fmtCell(val)}>{fmtCell(val)}</td>;
                      return <td key={col.key} className="adv-td" title={fmtCell(val)}>{fmtCell(val)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      {filtered.length > 0 && (
        <div className="adv-footer">
          <div className="adv-footer-item">
            <div className="adv-footer-label">Showing</div>
            <div className="adv-footer-val">{filtered.length.toLocaleString()}</div>
          </div>
          <div className="adv-footer-item">
            <div className="adv-footer-label">Total</div>
            <div className="adv-footer-val">{scopedRows.length.toLocaleString()}</div>
          </div>
          {SA && viewMode === "all" && (
            <div className="adv-footer-item">
              <div className="adv-footer-label">Orgs</div>
              <div className="adv-footer-val" style={{ background:"linear-gradient(135deg,#f5a623,#fbbf24)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>
                {tenantList.length}
              </div>
            </div>
          )}
          <div className="adv-footer-item">
            <div className="adv-footer-label">Clients</div>
            <div className="adv-footer-val" style={{ background:"linear-gradient(135deg,#7c3aed,#a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>
              {clientList.length}
            </div>
          </div>
          <div className="adv-footer-item">
            <div className="adv-footer-label">Sent</div>
            <div className="adv-footer-val" style={{ background:"linear-gradient(135deg,#10b981,#34d399)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>
              {filtered.filter(r => (r.Status || r.status) === "Sent").length}
            </div>
          </div>
          <div className="adv-footer-item">
            <div className="adv-footer-label">Pending</div>
            <div className="adv-footer-val" style={{ background:"linear-gradient(135deg,#f59e0b,#fbbf24)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>
              {filtered.filter(r => (r.Status || r.status || "Pending") === "Pending").length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}