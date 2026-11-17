// src/components/DailyClosedCases.jsx
// READ-ONLY, purely additive. No edits to MyTable, no backend calls.
// Filters the already-scoped in-memory dashboardData for closed records,
// groups by calendar date, and exports using the SAME logic as MyTable's
// downloadExcel (pure functions copied verbatim — no React state needed).

import { useMemo, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { getTierForRow } from "./tierLookup";
import { uploadAPI } from "../api/api";

/* ─── constants (must match MyTable.jsx) ─────────────────────────────── */
const SUPER_ADMIN_EMAIL = "superadmin@tervies.com";

/* ─── pure helpers (copied verbatim from MyTable.jsx module scope) ───── */
function normalizeEmail(v = "") { return String(v || "").trim().toLowerCase(); }

function getRowStatus(row) {
  if (!row) return "Pending";
  return (
    row["Status"] || row["status"] || row["STATUS"] ||
    row["Case Status"] || row["BGV Status"] ||
    row["Verification Status"] || row["Current Status"] ||
    (row.rawData && typeof row.rawData === "object" && (
      row.rawData["Status"] || row.rawData["status"] || row.rawData["STATUS"] ||
      row.rawData["Case Status"] || row.rawData["BGV Status"] ||
      row.rawData["Verification Status"] || row.rawData["Current Status"]
    )) || "Pending"
  );
}

function getRowTier(row) {
  if (!row) return null;
  const stored =
    row["Tier"] || row["tier"] || row["TIER"] ||
    row["Tier Type"] || row["tier type"] || row["TierType"] ||
    (row.rawData && (row.rawData["Tier"] || row.rawData["tier"] || row.rawData["Tier Type"]));
  if (stored) {
    const t = String(stored).trim();
    const m = t.match(/(\d)/);
    return m ? `Tier${m[1]}` : t;
  }
  return getTierForRow(row);
}

/* ─── date helpers (copied verbatim from inside downloadExcel) ─────────── */
function isDateColumnName(col = "") {
  const c = String(col || "").toLowerCase();
  return (
    c.includes("date") ||
    c === "assigned date" || c === "assign date" ||
    c === "completed date" || c === "vendor close date"
  );
}

// Exact copy of parseExportDateForPenalty (MyTable line 4095)
function parseDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 1000 && serial < 80000 &&
      raw === String(Math.floor(serial))) {
    const jsDate = new Date(new Date(Date.UTC(1899, 11, 30)).getTime() + serial * 86400000);
    if (!Number.isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1950 && jsDate.getFullYear() < 2100)
      return jsDate;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const jsDate = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1950 && jsDate.getFullYear() < 2100)
      return jsDate;
  }

  const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (m) {
    const first = Number(m[1]), second = Number(m[2]);
    let year = Number(m[3]);
    const shortYear = m[3].length === 2;
    if (year < 100) year += 2000;
    let day, month;
    if (first > 12)       { day = first;  month = second; }
    else if (second > 12) { month = first; day = second;  }
    else if (shortYear)   { month = first; day = second;  }
    else                  { day = first;  month = second; }
    const jsDate = new Date(year, month - 1, day);
    if (!Number.isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1950 && jsDate.getFullYear() < 2100)
      return jsDate;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() > 1950 && parsed.getFullYear() < 2100)
    return parsed;

  return null;
}

// Exact copy of toExportDate (MyTable line 4022)
function toExportDate(value) {
  if (value === undefined || value === null || value === "") return "";
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (day, month, year) => `${pad(day)}-${pad(month)}-${year}`;
  const makeDateText = (d, useUTC = false) => {
    const day   = useUTC ? d.getUTCDate()      : d.getDate();
    const month = useUTC ? d.getUTCMonth() + 1 : d.getMonth() + 1;
    const year  = useUTC ? d.getUTCFullYear()  : d.getFullYear();
    return fmt(day, month, year);
  };

  if (value instanceof Date && !Number.isNaN(value.getTime())) return makeDateText(value);

  const raw = String(value).trim();
  if (!raw) return "";

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const jsDate = new Date(new Date(Date.UTC(1899, 11, 30)).getTime() + serial * 86400000);
    if (!Number.isNaN(jsDate.getTime())) return makeDateText(jsDate, true);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return makeDateText(d, raw.includes("T"));
  }
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(raw)) {
    const parts = raw.split(/[\/-]/).map((p) => p.trim());
    let a = Number(parts[0]), b = Number(parts[1]), y = Number(parts[2]);
    if (y < 100) y += 2000;
    let day, month;
    if (a > 12)      { day = a; month = b; }
    else if (b > 12) { day = b; month = a; }
    else             { day = a; month = b; }
    if (day && month && y) return fmt(day, month, y);
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return makeDateText(parsed);
  return raw;
}

// Exact copies of column classifiers (MyTable lines 4082–4303)
function isExportDateColumn(col = "") {
  const c = String(col || "").trim().toLowerCase();
  return isDateColumnName(col) ||
    c === "assigned" || c === "assign" || c === "completed" ||
    c === "closed" || c === "close" || c === "vendor close";
}

function isBlockedExportColumn(col = "") {
  const c = String(col || "").trim().toLowerCase();
  return (
    c === "client name" || c === "clientname" || c === "insuff" ||
    c === "completed" || c === "complete" ||
    c === "completed date" || c === "complete date" ||
    c === "assigned" || c === "assigned date" || c === "assign date"
  );
}

function isExportPenaltyColumn(col = "") {
  return ["penalty %","penalty","pending penalty","pendingpenalty","tat","tat days","pending days"]
    .includes(String(col || "").trim().toLowerCase());
}

/* ─── completed date lookup (same priority as getExportCellValue) ─────── */
function getCompletedDateRaw(row) {
  return (
    row["Completed Date"] || row["Complete Date"] ||
    row.completedDate || row.closedDate || row["Closed Date"] ||
    row["Vendor Close Date"] ||
    row.rawData?.["Completed Date"] || row.rawData?.["Complete Date"] ||
    row.rawData?.completedDate || row.rawData?.closedDate ||
    row.rawData?.["Closed Date"] || row.rawData?.["Vendor Close Date"] || ""
  );
}

function toDateKey(jsDate) {
  if (!jsDate) return null;
  return `${jsDate.getFullYear()}-${String(jsDate.getMonth()+1).padStart(2,"0")}-${String(jsDate.getDate()).padStart(2,"0")}`;
}

/* ─── export logic (mirrors downloadExcel for isClosedExport=true, showPricing=false) */

// Base columns matching MyTable's cols (with all insuff + stop detail, no vendor block)
const BASE_COLS = [
  "S.NO","Company Name","Client Name","Check Id","Check Name","Sub Check Type","Status","Tier",
  "Insuff Remark","Insuff Date","Insuff Clear Date","Insuff Clear Remark",
  "Candidate Name","Candidate Father Name",
  "Candidate Phone Number","Candidate Alternative number",
  "Address","City","State","Pincode","Assigned Date","Completed Date",
  "Stop Date","Stop Remark",
];

function buildExportHeaders() {
  // portalHeaders = filtered BASE_COLS + "Vendor Complete Date" (always, per MyTable line 4312)
  const portalHeaders = [
    ...BASE_COLS.filter(col => !isBlockedExportColumn(col) && !isExportPenaltyColumn(col)),
    "Vendor Complete Date",
  ];
  // exportHeaders = same filter (idempotent for these columns)
  const exportHeaders = portalHeaders.filter(col => !isBlockedExportColumn(col) && !isExportPenaltyColumn(col));
  // isClosedExport=true: append Assigned Date + Completed Date (MyTable lines 4325-4332)
  if (!exportHeaders.includes("Assigned Date"))  exportHeaders.push("Assigned Date");
  if (!exportHeaders.includes("Completed Date")) exportHeaders.push("Completed Date");
  return exportHeaders;
}

function getExportCellValue(row, col, index) {
  if (col === "S.NO") return index + 1;
  if (col === "Status") return getRowStatus(row);
  if (col === "Tier")   return getRowTier(row) || "";

  if (col === "Assigned Date") {
    return toExportDate(
      row["Assigned Date"] || row["Assign Date"] || row.assignDate || row.assignedDate ||
      row["Sent Date"] || row.vendorSentDate || row["Vendor Sent Date"] ||
      row["Vendor Assign Date"] || row["Vendor Assigned Date"] ||
      row["Vendor Date"] || row["Sent to Vendor"] || row.uploadedAt || row.createdAt ||
      row.rawData?.["Assigned Date"] || row.rawData?.["Assign Date"] || row.rawData?.assignDate ||
      row.rawData?.assignedDate || row.rawData?.["Sent Date"] || row.rawData?.vendorSentDate ||
      row.rawData?.["Vendor Sent Date"] || row.rawData?.["Vendor Assign Date"] ||
      row.rawData?.["Vendor Assigned Date"] || row.rawData?.["Vendor Date"] ||
      row.rawData?.["Sent to Vendor"] || row.rawData?.uploadedAt || row.rawData?.createdAt || ""
    );
  }
  if (col === "Completed Date") {
    return toExportDate(getCompletedDateRaw(row));
  }
  if (col === "Vendor Complete Date") {
    return toExportDate(
      row["Vendor Complete Date"] || row.vendorCompleteDate ||
      row.rawData?.["Vendor Complete Date"] || row.rawData?.vendorCompleteDate || ""
    );
  }
  if (isExportPenaltyColumn(col)) return "";

  let value = row[col];
  if ((value === undefined || value === null || value === "") && row.rawData && typeof row.rawData === "object") {
    value = row.rawData[col];
  }
  if (isExportDateColumn(col)) return toExportDate(value);
  return value ?? "";
}

// Exact copy of buildSecondaryAdminHeaders (MyTable lines 4468-4508)
function buildFullDetailHeaders(rows, exportHeaders) {
  const blocked = new Set([
    "rawData","_realIdx","__v","pdfDataUrl","reportFile","_reportKey","_hasReport",
    "tenantId","ownerAdminEmail","assignedByEmail","updatedByEmail","updatedByRole",
  ]);
  const headers = [];
  const push = (key) => {
    const clean = String(key || "").trim();
    if (!clean || blocked.has(clean)) return;
    if (!headers.some(h => String(h).trim().toLowerCase() === clean.toLowerCase()))
      headers.push(clean);
  };
  exportHeaders.forEach(push);
  rows.forEach(row => {
    if (row?.rawData && typeof row.rawData === "object") Object.keys(row.rawData).forEach(push);
    Object.keys(row || {}).forEach(push);
  });
  if (!headers.some(h => String(h).trim().toLowerCase() === "status")) headers.push("Status");
  return headers;
}

function downloadClosedXlsx(rows, fileSuffix, currentUser, isTeam) {
  // Role detection — exact same logic as downloadExcel (MyTable lines 4426-4466)
  const roleKey    = String(currentUser?.role || "").trim().toLowerCase();
  const emailKey   = normalizeEmail(currentUser?.email || "");
  const isSA       = roleKey === "superadmin" || emailKey === normalizeEmail(SUPER_ADMIN_EMAIL);
  const isSecAdmin = !isSA && ["admin","secondary_admin","secondaryadmin","tenantadmin","tenant_admin"].includes(roleKey);
  const teamOwner  = normalizeEmail(currentUser?.ownerAdminEmail || currentUser?.adminEmail || "");
  const isInternalSuperTeam = currentUser?.isInternal === true ||
    (!currentUser?.tenantId && !currentUser?.ownerAdminEmail) ||
    teamOwner === normalizeEmail(SUPER_ADMIN_EMAIL);
  const isSecTeam    = isTeam && !isInternalSuperTeam && !!teamOwner;
  const fullDetail   = isSecAdmin || isSecTeam;

  const exportHeaders  = buildExportHeaders();
  const finalHeaders   = fullDetail ? buildFullDetailHeaders(rows, exportHeaders) : exportHeaders;

  const exportData = rows.map((row, i) => {
    const obj = {};
    finalHeaders.forEach(col => { obj[col] = getExportCellValue(row, col, i); });
    return obj;
  });

  const ws  = XLSX.utils.json_to_sheet(exportData, { header: finalHeaders });
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Closed");
  const buf  = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8" });
  saveAs(blob, `DailyClosed_${fileSuffix}.xlsx`);
}

/* ─── React component ─────────────────────────────────────────────────── */
export default function DailyClosedCases({ currentUser, isTeam }) {
  const [downloading, setDownloading] = useState(null);

  // Fetches only a thin projection of Closed records (status + every
  // possible completed-date field name, no rawData/PII) directly from the
  // server — this used to fetch full rows (getRecords({status:"closed",
  // limit:100000})), shipping every field of every closed record just to
  // group them by date, which got slow once the closed-case count grew into
  // the thousands. Full row data is fetched later, per date, only when the
  // admin actually clicks Download (see handleDownload below).
  const [closedRows, setClosedRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    uploadAPI.getClosedCasesSummary(isTeam ? { scopeToAllocations: "true" } : {})
      .then(rows => { if (!cancelled) setClosedRows(Array.isArray(rows) ? rows : []); })
      .catch(err => console.warn("Daily closed cases fetch failed:", err.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isTeam]);

  // Group closed rows by calendar date (newest first) — same parsing logic
  // as before, just running on the thin rows instead of full ones. Each
  // group now tracks record _ids (for the on-demand full-row fetch at
  // download time) instead of holding the full row objects up front.
  const dateGroups = useMemo(() => {
    const map = {};
    closedRows.forEach(row => {
      if (getRowStatus(row).toLowerCase().trim() !== "closed") return;
      const raw = getCompletedDateRaw(row);
      if (!raw) return;
      const jsDate = parseDate(raw);
      if (!jsDate) return;
      const key = toDateKey(jsDate);
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          key,
          label: jsDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          ids: [],
          count: 0,
        };
      }
      if (row._id) map[key].ids.push(row._id);
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [closedRows]);

  const handleDownload = async (group) => {
    setDownloading(group.key);
    try {
      // Full row data (every field, needed for the Excel export) is only
      // fetched now, scoped to just this date's records — not upfront for
      // every closed record in the system.
      const fullRows = await uploadAPI.getRecords({ ids: group.ids.join(",") });
      downloadClosedXlsx(Array.isArray(fullRows) ? fullRows : [], group.label.replace(/\s+/g, "_"), currentUser, isTeam);
    } catch (e) {
      alert("Export failed: " + (e.message || "Unknown error"));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header card */}
      <div style={{
        background: "var(--card)", border: "1.5px solid var(--border2)",
        borderRadius: "var(--r16)", padding: "20px 24px", boxShadow: "var(--shadow)",
      }}>
        <div style={{ fontFamily: "var(--head)", fontSize: 17, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
          📆 Daily Closed Cases
        </div>
        <div style={{ fontSize: 13, color: "var(--text3)" }}>
          Cases closed per day — click Download to get the same Excel as "Export Excel" on the Closed filter.
          Dates are newest first. Only dates with at least one closed case are shown.
        </div>
      </div>

      {loading && (
        <div style={{
          background: "var(--card)", border: "1.5px dashed var(--border2)",
          borderRadius: "var(--r16)", padding: "48px 24px",
          textAlign: "center", boxShadow: "var(--shadow)",
        }}>
          <div style={{ fontFamily: "var(--head)", fontSize: 16, fontWeight: 700, color: "var(--text3)" }}>
            Loading…
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && dateGroups.length === 0 && (
        <div style={{
          background: "var(--card)", border: "1.5px dashed var(--border2)",
          borderRadius: "var(--r16)", padding: "48px 24px",
          textAlign: "center", boxShadow: "var(--shadow)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.22 }}>📭</div>
          <div style={{ fontFamily: "var(--head)", fontSize: 16, fontWeight: 700, color: "var(--text3)" }}>
            No closed cases found
          </div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 6 }}>
            Cases appear here when their Status is Closed and a Completed Date is recorded.
          </div>
        </div>
      )}

      {/* Date list */}
      {dateGroups.length > 0 && (
        <div style={{
          background: "var(--card)", border: "1.5px solid var(--border2)",
          borderRadius: "var(--r16)", boxShadow: "var(--shadow)", overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.08),rgba(37,99,235,0.04))" }}>
                {["Date", "Cases Closed", ""].map(h => (
                  <th key={h} style={{
                    padding: "12px 20px", textAlign: h === "Cases Closed" ? "right" : "left",
                    fontFamily: "var(--head)", fontSize: 11, fontWeight: 600,
                    color: "var(--text3)", letterSpacing: "0.06em", textTransform: "uppercase",
                    borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dateGroups.map((group, i) => (
                <tr key={group.key} style={{
                  borderBottom: i < dateGroups.length - 1 ? "1px solid var(--border2)" : "none",
                  background: i % 2 === 0 ? "transparent" : "rgba(16,185,129,0.02)",
                }}>
                  <td style={{
                    padding: "14px 20px", fontFamily: "var(--head)", fontSize: 14,
                    fontWeight: 700, color: "var(--text)",
                  }}>
                    📆 {group.label}
                  </td>
                  <td style={{
                    padding: "14px 20px", textAlign: "right",
                    fontFamily: "var(--head)", fontSize: 16, fontWeight: 700, color: "#059669",
                  }}>
                    {group.count}
                  </td>
                  <td style={{ padding: "14px 20px", textAlign: "right" }}>
                    <button
                      onClick={() => handleDownload(group)}
                      disabled={downloading === group.key}
                      style={{
                        fontFamily: "var(--head)", fontSize: 12, fontWeight: 600,
                        padding: "7px 16px", borderRadius: "var(--r8)",
                        border: "none", cursor: downloading === group.key ? "default" : "pointer",
                        background: downloading === group.key ? "rgba(16,185,129,0.12)" : "var(--accentg)",
                        color: downloading === group.key ? "#059669" : "#fff",
                        opacity: downloading === group.key ? 0.7 : 1,
                        transition: "all 0.15s", whiteSpace: "nowrap",
                      }}
                    >
                      {downloading === group.key ? "Downloading…" : "⬇ Download Excel"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
