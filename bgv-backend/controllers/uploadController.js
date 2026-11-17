// bgv-backend/controllers/uploadController.js

import XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { saveToSentFolder } from "../utils/saveToSentFolder.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { execFile } from "child_process";
import { promisify } from "util";
import { Worker } from "worker_threads";

import {
  uploadBufferToS3,
  getPresignedViewUrl,
  downloadObjectBuffer,
} from "../utils/s3.js";

import Record from "../models/Record.js";
import MailConfig from "../models/MailConfig.js";
import StatusAudit from "../models/StatusAudit.js";
import PortalState from "../models/PortalState.js";
import VendorContact from "../models/VendorContact.js";
import User from "../models/User.js";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/* ───────────────────────── HELPERS ───────────────────────── */

// Super admin only (see call site below) — fixes "Assigned Date" landing on
// the wrong YEAR (e.g. 2026 showing as 2028). Root cause: plain `new
// Date(val)` on an ambiguous short date string like "28/06/2026" lets the
// native parser misread "28" as a month number; Date's month argument rolls
// over into later years for any value above 12 (month 28 = 2 years + month
// 4), which lands exactly 2 years ahead of the real date. This parser never
// hands an ambiguous day/month string to the native parser — it resolves
// day vs month itself (same DD/MM vs MM/DD tie-break already used for the
// on-screen date display elsewhere in this app) and also understands a raw
// Excel date serial number, which `new Date(val)` would otherwise read as
// milliseconds since 1970 and land in January 1970.
// strict=true (every role, during Daily Excel upload): a genuinely
// ambiguous short numeric date (both parts <=12, e.g. "05/08/2026")
// is REJECTED outright instead of being guessed as DD/MM — some uploaded
// files genuinely use MM/DD (a vendor's own export, a candidate's own
// system), and silently assuming DD/MM for those corrupts the date in the
// other direction. Rejecting it entirely means the only way an ambiguous
// date makes it in is if the uploader fixes their file to an unambiguous
// shape (a month name like "11-Dec-2026", or a day >12 that can't be
// mistaken for a month) — never a silent guess either way, for anyone.
function parseExcelDateSafe(val, strict = false) {
  if (val === undefined || val === null || val === "") return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

  const excelEpoch = Date.UTC(1899, 11, 30);
  if (typeof val === "number" && Number.isFinite(val) && val > 20000 && val < 80000) {
    const d = new Date(excelEpoch + val * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  const raw = String(val).trim();
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(excelEpoch + serial * 86400000);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // ISO: 2026-06-18, 2026/06/18, 2026.06.18 (with optional time)
  if (/^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}([ T]|$)/.test(raw)) {
    const normalized = raw.replace(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/, "$1-$2-$3");
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) return d;
  }

  // Short date DD/MM/YYYY or MM/DD/YYYY — resolved ourselves, never handed
  // to the native parser, which is what causes the +2-year rollover bug.
  const dmyMatch = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(\s|$)/);
  if (dmyMatch) {
    const a = Number(dmyMatch[1]);
    const b = Number(dmyMatch[2]);
    let y = Number(dmyMatch[3]);
    if (y < 100) y += 2000;
    let day, month;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { day = b; month = a; }
    else if (strict) { return null; } // genuinely ambiguous — reject rather than guess
    else { day = a; month = b; } // ambiguous — this app is always DD/MM/YYYY, never MM/DD
    if (day && month && y && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(y, month - 1, day));
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  // Month-name forms: "6-Jul-26", "12 Jul 2026", "Jul 12 2026"
  const MONTH_NAMES = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  const dayMonthName = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-\/]([A-Za-z]{3,9})[\s\-\/]?,?\s?(\d{2,4})$/i);
  if (dayMonthName) {
    const mNum = MONTH_NAMES[dayMonthName[2].toLowerCase().slice(0, 4)] || MONTH_NAMES[dayMonthName[2].toLowerCase().slice(0, 3)];
    if (mNum) {
      let yy = Number(dayMonthName[3]);
      if (yy < 100) yy += 2000;
      const dd = Number(dayMonthName[1]);
      if (dd) {
        const d = new Date(Date.UTC(yy, mNum - 1, dd));
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  const monthNameDay = raw.match(/^([A-Za-z]{3,9})[\s\-\/](\d{1,2})(?:st|nd|rd|th)?,?[\s\-\/](\d{2,4})$/i);
  if (monthNameDay) {
    const mNum = MONTH_NAMES[monthNameDay[1].toLowerCase().slice(0, 4)] || MONTH_NAMES[monthNameDay[1].toLowerCase().slice(0, 3)];
    if (mNum) {
      let yy = Number(monthNameDay[3]);
      if (yy < 100) yy += 2000;
      const dd = Number(monthNameDay[2]);
      if (dd) {
        const d = new Date(Date.UTC(yy, mNum - 1, dd));
        if (!isNaN(d.getTime())) return d;
      }
    }
  }

  // Last-resort native parse, for formats none of the explicit branches
  // above recognized — JS's own Date parser guesses MM/DD for an ambiguous
  // string, so strict mode refuses this fallback entirely rather than risk
  // the same silent misread it exists to prevent.
  if (strict) return null;
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Canonicalizes an arbitrary "Assigned Date" input (from an Excel upload, a
// manual add, or an edit that resends a cached row) into one unambiguous
// string shape plus the real Date — used so the stored value can never again
// disagree with itself or get reinterpreted differently by a later edit.
// addRecord and updateRecord both used to store whatever raw string the
// client happened to send, verbatim, with no parsing at all — a date
// uploaded as "05/08/2026" stayed exactly that ambiguous string forever,
// and every unrelated edit that resent it (the same pattern that caused the
// Status-reversion bug) kept re-stamping that same raw, unparsed value. This
// is the single choke point both now go through instead.
function resolveAssignedDate(rawValue, strict = false) {
  const parsed = parseExcelDateSafe(rawValue, strict);
  if (!parsed) return null;
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = parsed.getUTCFullYear();
  return { date: parsed, str: `${dd}-${mm}-${yyyy}` };
}

function fmtDate(val) {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function cleanStr(val) {
  return val ? String(val).trim() : "";
}

function safeTrim(val) {
  return String(val || "").trim();
}

function normalizeStatus(val = "") {
  const key = String(val || "Pending").trim().toLowerCase();
  const map = {
    pending: "Pending",
    insuff: "Insuff",
    insufficient: "Insuff",
    "insuff clear": "Insuff Clear",
    insuffclear: "Insuff Clear",
    closed: "Closed",
    close: "Closed",
    hold: "Hold",
    stop: "Stop",
    stopped: "Stop",
    sent: "Sent",
  };
  // Any value outside the known set (bad upload column, stray manual edit,
  // junk from another field landing here) falls back to "Pending" instead
  // of being written through verbatim — that's how "Emp3"/"Emp2" ended up
  // stored as literal statuses and displayed as an unrecognized badge.
  return map[key] || "Pending";
}

// Same "DD Mon YYYY, HH:MM am/pm" format the frontend's todayStr() already
// stamps onto Completed Date when a case is closed through the app (single-
// row status change, Bulk Update). Matching it here keeps Cost Summary's
// month-parsing (which already handles that exact shape) working the same
// way for dates set from either place.
function todayStr() {
  return new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Belt-and-suspenders server-side guard for Special Billing Date, mirroring
// the frontend's normalizeSpecialBillingDateInput — catches a bad year
// (e.g. a 2-digit year mis-saved as "0022") regardless of which client/path
// the request came from. Returns a normalized ISO date string, or throws if
// out of a sane range so the caller can reject the whole update with a clear
// error instead of silently writing a garbage year.
function normalizeSpecialBillingDateOrThrow(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid special billing date");
  }
  let y = d.getFullYear();
  if (y < 100) {
    // A 2-digit year landed in a 4-digit slot (e.g. "0022") — treat as 20xx.
    y += 2000;
    d.setFullYear(y);
  }
  if (y < 2000 || y > 2100) {
    throw new Error(`Special billing date year (${y}) is out of range (2000-2100)`);
  }
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function flattenRecord(doc) {
  if (!doc) return null;

  const obj = doc.toObject ? doc.toObject() : doc;
  const raw = obj.rawData || {};

  return {
    ...obj,
    _id: obj._id,
    id: obj._id,
    tenantId: obj.tenantId !== undefined ? obj.tenantId : null,

    "Client Name": obj.clientName || raw["Client Name"] || "",
    "Candidate Name": obj.candidateName || raw["Candidate Name"] || "",
    "Check Name": obj.checkName || raw["Check Name"] || "",

    Status: obj.status || raw.Status || raw.status || "Pending",
    status: obj.status || raw.status || "Pending",

    rate:
      obj.rate !== undefined
        ? obj.rate
        : raw.rate !== undefined
        ? raw.rate
        : 0,

    agent: obj.agent || raw.agent || "",
    assignDate: obj.assignDate || raw.assignDate || "",

    reportFile: obj.reportFile || raw.reportFile || "",
    reportFileName: obj.reportFileName || raw.reportFileName || "",
    reportUploaded: obj.reportUploaded || raw.reportUploaded || false,
    reportUploadedAt: obj.reportUploadedAt || raw.reportUploadedAt || null,
    reportUploadedBy: obj.reportUploadedBy || raw.reportUploadedBy || "",

    extraApproved:
      obj.extraApproved !== undefined
        ? obj.extraApproved
        : raw.extraApproved || false,

    extraAmount:
      obj.extraAmount !== undefined
        ? obj.extraAmount
        : raw.extraAmount || 0,

    isSpecialCase:
      obj.isSpecialCase !== undefined
        ? obj.isSpecialCase
        : (raw.isSpecialCase || false),

    // Falls back to rawData for older records that only ever had this set
    // there (before the top-level schema field existed) — without this,
    // those rows render with a blank Special Billing Month even though the
    // date is present, just not where this function was looking.
    specialBillingDate:
      obj.specialBillingDate !== undefined && obj.specialBillingDate !== null
        ? obj.specialBillingDate
        : (raw.specialBillingDate || null),
  };
}

/* ───────────────────────── SCOPE FILTER ───────────────────────── */

function getScopeFilter(req, tenantIdFromQuery = "") {
  const filter = {};

  const role = String(req.user?.role || "").toLowerCase();

  const isInternalTeam =
    req.user?.isInternal === true ||
    req.user?.internalTeam === true ||
    req.user?.userType === "internal" ||
    req.user?.teamType === "internal" ||
    req.user?.isInternalTeam === true;

  if (role === "superadmin") {
    if (tenantIdFromQuery) {
      filter.tenantId = tenantIdFromQuery;
    }
  } else if (isInternalTeam) {
    // Internal team is scoped to SA's records (tenantId: null) by default,
    // matching the super admin's own view — prevents fetching all tenants' data.
    filter.tenantId = tenantIdFromQuery || null;
  } else if (role === "admin" || role === "team") {
    filter.tenantId = req.user?.tenantId || null;
  }

  return filter;
}

/* ═══════════════════════════════════════════════════════════════════════
   SERVER-SIDE PAGINATION — STAGE 1 (additive, opt-in only)
   These helpers are only invoked when the caller explicitly passes the new
   `filters` / `scopeToAllocations` query params. The current frontend does
   not send them yet, so existing behavior of getRecords() is unchanged
   until a caller opts in. Reserved for the Stage 2 frontend migration.
═══════════════════════════════════════════════════════════════════════ */

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Maps a frontend column label to the DB field(s) it should query against.
// Known structured fields map directly; anything else falls back to the
// matching key inside rawData (which preserves every originally uploaded
// column verbatim), so custom/uploaded columns remain filterable too.
const KNOWN_COLUMN_FIELD_MAP = {
  "Client Name":    "clientName",
  "Candidate Name": "candidateName",
  "Check Name":     "checkName",
  "Status":         "status",
  "City":           "city",
  "State":          "state",
};

function buildFilterCondition(f) {
  const column    = String(f?.column || "").trim();
  const value     = String(f?.value || "").trim();
  const condition = String(f?.condition || "contains").trim();
  if (!column) return null;

  const dbField = KNOWN_COLUMN_FIELD_MAP[column] || `rawData.${column}`;
  const esc = escapeRegex(value);

  switch (condition) {
    case "equals":   return { [dbField]: { $regex: `^${esc}$`, $options: "i" } };
    case "contains": return { [dbField]: { $regex: esc,        $options: "i" } };
    case "starts":   return { [dbField]: { $regex: `^${esc}`,  $options: "i" } };
    case "ends":     return { [dbField]: { $regex: `${esc}$`,  $options: "i" } };
    case "gt":       return Number.isFinite(Number(value)) ? { [dbField]: { $gt: Number(value) } } : null;
    case "lt":       return Number.isFinite(Number(value)) ? { [dbField]: { $lt: Number(value) } } : null;
    default:         return null;
  }
}

const VENDOR_NAME_FIELDS = [
  "rawData.Vendor Name", "rawData.vendor name", "rawData.VendorName",
  "rawData.Vendor Company", "rawData.vendor company",
  "rawData.Vendor", "rawData.vendor",
];

// Mirrors the frontend's findUserAllocationsInMap / visibleClients / visibleVendors /
// visibleChecks logic exactly (same PortalState "allocations" document, same
// ownerAdminEmail → internal-staff-SA-bucket → tenant-admin-bucket priority,
// same name-based matching), just evaluated server-side instead of after the
// full dataset has already been fetched into the browser. Returns null when
// no allocation data is found for this user (caller should then return zero
// records, matching the frontend's "0 assigned" behavior).
async function buildAllocationScopeFilter(user) {
  const SA_EMAIL = "superadmin@tervies.com";
  const doc = await PortalState.findOne({ key: "allocations" }).lean();
  const map = doc?.value || {};

  const email = String(user?.email || "").trim().toLowerCase();
  const name  = String(user?.name  || "").trim().toLowerCase();
  const tenantId = user?.tenantId || null;
  const ownerAdminEmail = user?.ownerAdminEmail
    ? String(user.ownerAdminEmail).trim().toLowerCase()
    : null;
  const isInternal =
    user?.isInternal === true || (!tenantId && !ownerAdminEmail);

  const findList = (bucket) => {
    if (!bucket || typeof bucket !== "object") return [];
    for (const k of [email, name]) {
      if (k && Array.isArray(bucket[k]) && bucket[k].length > 0) return bucket[k];
    }
    return [];
  };

  const resolve = (prefix) => {
    if (ownerAdminEmail) {
      const found = findList(map[`${prefix}_${ownerAdminEmail}`]);
      if (found.length > 0) return found;
    }
    if (isInternal) {
      const found = findList(map[`${prefix}_${SA_EMAIL}`]);
      if (found.length > 0) return found;
    }
    return [];
  };

  const clients = resolve("clientAllocations");
  const vendors = resolve("vendorAllocations");
  const checks  = resolve("checkAllocations");

  if (clients.length === 0 && vendors.length === 0 && checks.length === 0) {
    return null;
  }

  const exact = (s) => new RegExp(`^${escapeRegex(String(s).trim())}$`, "i");
  const or = [];
  if (clients.length) or.push({ clientName: { $in: clients.map(exact) } });
  if (checks.length)  or.push({ checkName:  { $in: checks.map(exact) } });
  if (vendors.length) {
    const vendorRegexes = vendors.map(exact);
    VENDOR_NAME_FIELDS.forEach((field) => {
      or.push({ [field]: { $in: vendorRegexes } });
    });
  }

  return { $or: or };
}

/* ─────────────────── REAL-TIME REPORT STATUS (DELTA) ───────────────────
   Returns ONLY the records whose report was uploaded after `since`, with a
   tiny projection (no rawData, no heavy fields). The frontend polls this every
   few seconds so an admin sees a teammate's freshly uploaded report within
   seconds. Because it filters on reportUploadedAt > since, each poll returns
   only the handful of brand-new reports — payload stays small and the DB stays
   light. Scoping matches getRecords exactly via getScopeFilter. */
export async function getReportStatusUpdates(req, res) {
  try {
    const sinceRaw = req.query?.since;
    const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
    const validSince = sinceDate && !Number.isNaN(sinceDate.getTime());

    const scopeFilter = getScopeFilter(req, req.query?.tenantId || "");

    // ── 1. Report uploads (existing logic) ───────────────────────────────
    const reportFilter = { ...scopeFilter, reportUploaded: true };
    if (validSince) {
      reportFilter.reportUploadedAt = { $gt: sinceDate };
    }
    const reportRows = await Record.find(reportFilter)
      .select("_id status reportFile reportFileName reportUploaded reportUploadedAt reportUploadedBy")
      .sort({ reportUploadedAt: -1 })
      .limit(500)
      .lean();

    // ── 2. Status-only changes via StatusAudit (new) ─────────────────────
    // Returns records whose status was changed since `since`, even without
    // a report upload — so pure status changes are visible to all members.
    let statusRows = [];
    if (validSince) {
      const role = String(req.user?.role || "").toLowerCase();
      const isInt =
        req.user?.isInternal === true ||
        req.user?.internalTeam === true ||
        req.user?.isInternalTeam === true;
      // Use the same tenantId scope as the Record query for consistency.
      const auditTenantId =
        role === "superadmin" || isInt
          ? null
          : (req.user?.tenantId ?? null);

      const recentAudit = await StatusAudit.find({
        tenantId: auditTenantId,
        timestamp: { $gt: sinceDate },
      })
        .select("recordId")
        .sort({ timestamp: -1 })
        .limit(200)
        .lean();

      const changedIds = [
        ...new Set(
          recentAudit
            .map(a => a.recordId)
            .filter(Boolean)
            .map(String)
        ),
      ];

      if (changedIds.length > 0) {
        statusRows = await Record.find({
          _id: { $in: changedIds },
          ...scopeFilter,
        })
          .select("_id status reportFile reportFileName reportUploaded reportUploadedAt reportUploadedBy")
          .lean();
      }
    }

    // ── Merge — deduplicate by _id; statusRows override for status field ─
    const byId = new Map();
    reportRows.forEach(r => byId.set(String(r._id), r));
    statusRows.forEach(r => {
      const prev = byId.get(String(r._id));
      byId.set(String(r._id), prev ? { ...prev, ...r } : r);
    });

    return res.json({
      serverTime: new Date().toISOString(),
      updates: Array.from(byId.values()),
    });
  } catch (err) {
    console.error("getReportStatusUpdates error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

function canUserAccessRecord(req, record) {
  try {
    if (!req.user || !record) return false;

    const role = String(req.user.role || "").toLowerCase();

    if (role === "superadmin") {
      return true;
    }

    if (
      req.user.isInternal === true ||
      req.user.internalTeam === true ||
      req.user.userType === "internal" ||
      req.user.teamType === "internal" ||
      req.user.isInternalTeam === true
    ) {
      return true;
    }

    if (role === "admin" || role === "team") {
      return (
        String(req.user.tenantId || "") ===
        String(record.tenantId || "")
      );
    }

    return false;
  } catch (err) {
    console.log("canUserAccessRecord error:", err.message);
    return false;
  }
}

/* ───────────────────────── UPLOAD EXCEL ───────────────────────── */

export async function uploadExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
    });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
    });

    const batchId = uuidv4();

    // Duplicate-record prevention — multiple team members can upload
    // overlapping Daily Excel files (or re-upload the same file) at the
    // same time. Without this check, a row whose Check Id already exists
    // silently becomes a SECOND, separate record with the same Check Id —
    // and since the two now-independent records can end up with different
    // statuses (one closed, one still Pending), the portal and exports can
    // show conflicting results for what looks like "the same case" without
    // any obvious error. Mirrors the exact normalizeId convention already
    // used by bulkMatchByCheckId (string, trimmed, trailing ".0" stripped,
    // lowercase) so a Check Id stored as a number vs a string still matches.
    const uploadTenantId = req.user?.tenantId || req.body.tenantId || null;
    const normalizeCheckId = (v) => {
      let s = String(v === undefined || v === null ? "" : v).trim();
      s = s.replace(/\.0+$/, "");
      return s.toLowerCase();
    };
    const normalizeAddress = (v) =>
      String(v === undefined || v === null ? "" : v).replace(/\s+/g, " ").trim().toLowerCase();
    const getRowCheckId = (row) =>
      row["Check Id"] || row["Check ID"] || row["CheckId"] || row["Case ID"] || row["CaseID"] || "";
    const getRowSecondaryCheckId = (row) =>
      row["Secondary Check Id"] || row["Secondary Check ID"] || row["SecondaryCheckId"] || "";
    const getRowAddress = (row) => row["Address"] || row["address"] || "";

    // Secondary admin's duplicate check additionally keys on Secondary
    // Check Id + Address, not Check Id alone — two of their rows can
    // legitimately share one Check Id (e.g. a client-side case number
    // reused across sites/candidates), distinguished only by their own
    // Secondary Check Id and/or Address. Super admin's upload behavior is
    // unchanged (Check Id alone), so this only loosens/adjusts matching
    // for the secondary-admin tenant role.
    const isSecondaryAdminUpload = String(req.user?.role || "").trim().toLowerCase() === "admin";
    const getRowDedupeKey = (row) => {
      const checkId = normalizeCheckId(getRowCheckId(row));
      if (!checkId) return "";
      if (!isSecondaryAdminUpload) return checkId;
      const secondaryCheckId = normalizeCheckId(getRowSecondaryCheckId(row));
      const address = normalizeAddress(getRowAddress(row));
      return `${checkId}::${secondaryCheckId}::${address}`;
    };

    const existingRecords = await Record.find(
      { tenantId: uploadTenantId },
      { "rawData.Check Id": 1, "rawData.Case ID": 1, "rawData.Secondary Check Id": 1, "rawData.Address": 1 }
    ).lean();
    const existingKeys = new Set();
    existingRecords.forEach((r) => {
      const checkId = normalizeCheckId(r.rawData?.["Check Id"] || r.rawData?.["Case ID"] || "");
      if (!checkId) return;
      const key = isSecondaryAdminUpload
        ? `${checkId}::${normalizeCheckId(r.rawData?.["Secondary Check Id"] || "")}::${normalizeAddress(r.rawData?.["Address"] || "")}`
        : checkId;
      existingKeys.add(key);
    });

    const skippedDuplicateRows = [];
    const seenInThisUpload = new Set();
    const dedupedRows = rows.filter((row) => {
      const key = getRowDedupeKey(row);
      if (!key) return true; // no Check Id on this row — can't detect a duplicate, keep it
      if (existingKeys.has(key) || seenInThisUpload.has(key)) {
        skippedDuplicateRows.push(getRowCheckId(row));
        return false;
      }
      seenInThisUpload.add(key);
      return true;
    });

    // Applies to every role now, super admin included — an ambiguous date
    // (both day and month <=12) is rejected rather than guessed, same rule
    // for everyone's Daily Excel upload.
    const strictDates = true;
    const rejectedDateRows = [];

    const docs = dedupedRows.map((row) => ({
      uploadedBy: req.user?.email || "unknown",
      tenantId: req.user?.tenantId || req.body.tenantId || null,
      uploadBatch: batchId,
      uploadedAt: new Date(),

      clientName: cleanStr(
        row["Client Name"] ||
          row["clientName"] ||
          row["Company Name"] ||
          row["Company"] ||
          ""
      ),

      candidateName: cleanStr(
        row["Candidate Name"] ||
          row["candidateName"] ||
          row["Name"] ||
          ""
      ),

      checkName: cleanStr(
        row["Check Name"] ||
          row["checkName"] ||
          row["Check"] ||
          ""
      ),

      status: normalizeStatus(
        row["Status"] ||
          row["status"] ||
          "Pending"
      ),

      city: cleanStr(
        row["City"] ||
          row["District"] ||
          ""
      ),

      state: cleanStr(
        row["State"] || ""
      ),

      // Applies to every role now. This used to fall back to plain
      // parseDate() (new Date(val)) for secondary admin, which silently
      // assumes US MM/DD format for an ambiguous short date — corrupting
      // the canonical assignedDate field at the moment of ingestion, before
      // any display/export code ever sees it. parseExcelDateSafe resolves
      // day vs month itself (DD/MM by this app's convention) and is already
      // proven correct for superadmin's own uploads. strictDates (secondary
      // admin only) rejects a genuinely ambiguous date outright instead of
      // guessing DD/MM — see parseExcelDateSafe's strict param.
      assignedDate: parseExcelDateSafe(row["Assigned Date"] || row["Assign Date"], strictDates),

      rate: Number(
        row.rate ||
          row.Rate ||
          0
      ) || 0,

      agent: cleanStr(
        row.agent ||
          row.Agent ||
          ""
      ),

      assignDate: cleanStr(
        row.assignDate ||
          row["Assign Date"] ||
          ""
      ),

      reportFile: row.reportFile || "",
      reportFileName: row.reportFileName || "",
      reportUploaded: row.reportUploaded || false,
      reportUploadedAt: row.reportUploadedAt || null,
      reportUploadedBy: row.reportUploadedBy || "",

      extraApproved: row.extraApproved || false,
      extraAmount: Number(row.extraAmount || 0) || 0,

      rawData: (() => {
        const rawAssignedInput = row["Assigned Date"] || row["Assign Date"];
        const resolvedAD = resolveAssignedDate(rawAssignedInput, strictDates);
        // Canonicalized to the same unambiguous string as assignedDate above
        // (falls back to whatever raw value was given, untouched, if it
        // can't be parsed at all) — keeps rawData's own copy from disagreeing
        // with the real Date field or showing a different format per row.
        // In strict mode, a value that WAS present but got rejected as
        // ambiguous is blanked out here too — not just left unresolved —
        // so the ambiguous text can never resurface through display/export
        // re-parsing it later; it has to be re-entered unambiguously instead.
        let dateOverride = {};
        if (resolvedAD) {
          dateOverride = { "Assigned Date": resolvedAD.str };
        } else if (strictDates && rawAssignedInput) {
          dateOverride = { "Assigned Date": "", "Assign Date": "" };
          rejectedDateRows.push({
            checkId: getRowCheckId(row) || "(no Check Id)",
            value: String(rawAssignedInput),
          });
        }
        return {
          ...row,
          Status: normalizeStatus(row["Status"] || row["status"] || "Pending"),
          status: normalizeStatus(row["Status"] || row["status"] || "Pending"),
          ...dateOverride,
        };
      })(),
    }));

    if (docs.length > 0) {
      await Record.insertMany(docs);
    }

    res.json({
      message: "Uploaded",
      count: docs.length,
      skippedDuplicates: skippedDuplicateRows.length,
      skippedDuplicateCheckIds: skippedDuplicateRows.slice(0, 50),
      rejectedDates: rejectedDateRows.length,
      rejectedDateRows: rejectedDateRows.slice(0, 50),
      uploadBatch: batchId,
    });
  } catch (err) {
    console.error("uploadExcel error:", err.message);

    res.status(500).json({
      error: err.message,
    });
  }
}

/* ───────────────────────── GET RECORDS ───────────────────────── */

export async function getRecords(req, res) {
  try {
    const {
      tenantId,
      clientName,
      client,
      status,
      search,
      showAll,
      page = 1,
      limit = 100000,
      filters,             // NEW, opt-in — JSON array of {column, condition, value}
      filterLogic,         // NEW, opt-in — "AND" | "OR" (default AND)
      scopeToAllocations,  // NEW, opt-in — "true" to enforce allocation scoping server-side
      includeCount,        // NEW, opt-in — "true" to always return X-Total-Count, even with no filters
      specialCasesOnly,    // NEW, opt-in — "true" to only return isSpecialCase:true records
    } = req.query;

    let filter = {};

    if (
      showAll === "true" &&
      req.user.role === "superadmin"
    ) {
      // ALL RECORDS
    } else {
      filter = getScopeFilter(
        req,
        safeTrim(tenantId)
      );

      if (
        req.user.role === "superadmin" &&
        !showAll &&
        !safeTrim(tenantId)
      ) {
        filter.tenantId = null;
      }
    }

    const clientFilter = clientName || client;

    if (clientFilter) {
      filter.clientName = {
        $regex: safeTrim(clientFilter),
        $options: "i",
      };
    }

    if (status) {
      // Anchored ONLY when filtering for exactly "Insuff" — a plain
      // substring regex would otherwise also match "Insuff Clear" (a
      // separate, distinct status whose name happens to contain "Insuff").
      // Every other status value keeps the original loose substring match,
      // unchanged.
      const trimmedStatus = safeTrim(status);
      filter.status = trimmedStatus.toLowerCase() === "insuff"
        ? { $regex: "^insuff$", $options: "i" }
        : { $regex: trimmedStatus, $options: "i" };
    }

    if (specialCasesOnly === "true") {
      filter.isSpecialCase = true;
    }

    // NEW, opt-in — comma-separated record _ids. Used by the Daily Closed
    // Cases dashboard widget to fetch full row data for one specific date's
    // records only (on Download click), after already knowing which _ids
    // belong to that date from the lightweight closed-summary endpoint.
    if (req.query?.ids) {
      const idList = String(req.query.ids)
        .split(",")
        .map((s) => s.trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      if (idList.length > 0) filter._id = { $in: idList };
    }

    if (search && safeTrim(search)) {
      const s = safeTrim(search);
      const rx = { $regex: s, $options: "i" };

      // Expanded beyond the original 4 fields — still purely additive: only
      // used when a caller passes `search`, same as before.
      filter.$or = [
        { clientName: rx },
        { candidateName: rx },
        { checkName: rx },
        { status: rx },
        { city: rx },
        { state: rx },
        { "rawData.Address": rx },
        { "rawData.Pincode": rx },
        { "rawData.Candidate Phone Number": rx },
        // Case ID / Check Id specifically: some records (seen so far only
        // in secondary-admin data, likely from an older/different import
        // path) have this stored as a number instead of text. A plain
        // $regex silently matches nothing on a numeric field — Mongo only
        // regex-matches strings — which is why searching the exact Check
        // Id of such a record found it by address but not by the ID
        // itself. $expr + $toString converts the value to text first
        // (a no-op for records where it's already a string), so both
        // typings are searchable the same way, including partial matches.
        { $expr: { $regexMatch: { input: { $toString: { $ifNull: ["$rawData.Case ID", ""] } }, regex: s, options: "i" } } },
        { $expr: { $regexMatch: { input: { $toString: { $ifNull: ["$rawData.Check Id", ""] } }, regex: s, options: "i" } } },
        ...VENDOR_NAME_FIELDS.map((f) => ({ [f]: rx })),
      ];
    }

    // NEW, opt-in — column filter chips (equals/contains/starts/ends/gt/lt).
    // Current frontend does not send `filters` yet, so this block never runs
    // today; reserved for the Stage 2 frontend migration.
    if (filters) {
      try {
        const parsed = JSON.parse(filters);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const conditions = parsed.map(buildFilterCondition).filter(Boolean);
          if (conditions.length > 0) {
            const combined =
              filterLogic === "OR" ? { $or: conditions } : { $and: conditions };
            filter.$and = [...(filter.$and || []), combined];
          }
        }
      } catch (_) {
        // Malformed filters param — ignore rather than fail the whole request.
      }
    }

    // NEW, opt-in — server-side allocation scoping for team users. Current
    // frontend does not send `scopeToAllocations` yet, so this block never
    // runs today; reserved for the Stage 2 frontend migration.
    if (scopeToAllocations === "true" && req.user?.role === "team") {
      const allocFilter = await buildAllocationScopeFilter(req.user);
      if (!allocFilter) {
        res.set("X-Total-Count", "0");
        return res.json([]);
      }
      filter.$and = [...(filter.$and || []), allocFilter];
    }

    const pageNum = Math.max(
      1,
      Number(page)
    );

    const limitNum = Math.min(
      100000,
      Math.max(1, Number(limit))
    );

    const skip = (pageNum - 1) * limitNum;

    // Total count is returned via a response header (not the JSON body) so
    // the existing response shape — a plain array — stays exactly as every
    // current caller expects. Strictly opt-in via the new params only, so
    // the current progressive-batch-loading hot path (which never needs a
    // total count) never pays for an extra countDocuments() query.
    const wantsCount = !!filters || scopeToAllocations === "true" || includeCount === "true";

    const [records, total] = await Promise.all([
      Record.find(filter)
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .batchSize(limitNum)
        .lean(),
      wantsCount ? Record.countDocuments(filter) : Promise.resolve(null),
    ]);

    if (total !== null) res.set("X-Total-Count", String(total));

    res.json(
      records.map(flattenRecord)
    );
  } catch (err) {
    console.error("getRecords error:", err.message);

    res.status(500).json({
      error: err.message,
    });
  }
}

/* ───────────────────────── FULL-DETAIL EXPORT (SERVER-SIDE) ─────────────
   Secondary admin's "full detail" Excel export (every uploaded raw column,
   not just a curated list) was being built entirely in the browser — for a
   tenant with tens of thousands of records and dozens of raw columns, the
   resulting in-memory workbook can reach 100MB+, and the browser build of
   the `xlsx` library writes that out through a legacy binary-string path
   (`a2s`, converting the whole zip buffer to a giant JS string one
   character at a time) that silently throws "Invalid array length" under
   memory pressure at that size — with no error shown to the user, just a
   file that never downloads. Node's Buffer-backed write path doesn't go
   through that code at all, so building the same file here instead (where
   memory isn't shared with a rendering browser tab) sidesteps the crash
   entirely, confirmed against this tenant's real data. */
export async function exportFullDetail(req, res) {
  try {
    const { tenantId, clientName, client, status, search } = req.query;

    let filter = getScopeFilter(req, safeTrim(tenantId));
    if (req.user.role === "superadmin" && filter.tenantId === undefined) {
      filter.tenantId = null;
    }

    const clientFilter = clientName || client;
    if (clientFilter) {
      filter.clientName = { $regex: safeTrim(clientFilter), $options: "i" };
    }

    if (status) {
      const trimmedStatus = safeTrim(status);
      filter.status = trimmedStatus.toLowerCase() === "insuff"
        ? { $regex: "^insuff$", $options: "i" }
        : { $regex: trimmedStatus, $options: "i" };
    }

    if (search && safeTrim(search)) {
      const s = safeTrim(search);
      const rx = { $regex: s, $options: "i" };
      filter.$or = [
        { clientName: rx }, { candidateName: rx }, { checkName: rx },
        { status: rx }, { city: rx }, { state: rx },
        { "rawData.Address": rx }, { "rawData.Pincode": rx },
        { "rawData.Candidate Phone Number": rx },
        { $expr: { $regexMatch: { input: { $toString: { $ifNull: ["$rawData.Case ID", ""] } }, regex: s, options: "i" } } },
        { $expr: { $regexMatch: { input: { $toString: { $ifNull: ["$rawData.Check Id", ""] } }, regex: s, options: "i" } } },
        ...VENDOR_NAME_FIELDS.map((f) => ({ [f]: rx })),
      ];
    }

    // Blocked everywhere: internal/system bookkeeping fields the admin never
    // uploaded and has no use for in an export.
    const BLOCKED_KEYS = new Set([
      "_id", "id", "__v", "rawData", "dedupeKey",
      "pdfDataUrl", "reportFile", "reportS3Key", "_reportKey", "_hasReport",
      "tenantId", "ownerAdminEmail", "assignedByEmail", "updatedByEmail",
      "updatedByRole", "isInternalTeamUpdate", "uploadedBy", "uploadBatch",
      "dailyUploadId", "reportUploadedBy", "S",
    ]);
    // Blocked ONLY from the flat/camelCase side — each of these duplicates a
    // capitalized column that already comes from rawData in its original
    // upload order (Company Name, Check Id, Check Name, Candidate Name, ...);
    // keeping both just produced two near-identical columns side by side.
    const FLAT_DUPLICATE_KEYS = new Set([
      "clientName", "candidateName", "checkName", "city", "state",
      "assignedDate", "status", "uploadedAt",
    ]);

    // Two records uploaded through different paths (bulk Excel vs the
    // single-row "Add"/"Upload Daily Excel" flow) can insert the SAME keys
    // in a different order on each document — e.g. a manually-added row's
    // rawData has Status/assignDate inserted first, a bulk-uploaded row has
    // them last. Scanning records most-recent-first and pushing headers in
    // whatever order each record's keys happen to be in meant the column
    // order could flip depending on which record happened to be scanned
    // first. A fixed priority list for the well-known upload-template
    // columns makes the order stable and match what was actually uploaded,
    // regardless of which record got scanned first; anything else
    // discovered gets appended after, in first-seen order.
    const PRIORITY_COLUMNS = [
      "S.NO", "Client Name", "Company Name", "Check Id", "Check Name",
      "Sub Check Type", "Candidate Name", "Candidate Father Name",
      "Candidate Phone Number", "Candidate Alternative number",
      "Address", "City", "State", "Pincode", "Assigned Date", "Vendor Name",
      "Status", "Secondary Check Id", "Insuff Remark", "Insuff Clear Date",
    ];

    // Insuff Remark / Insuff Clear Date are secondary-admin-only export
    // columns — superadmin's export stays as it was before this was added.
    const isSecondaryAdmin = String(req.user?.role || "").toLowerCase() === "admin";

    const discovered = new Set();
    const discoveredOrder = [];
    const noteKey = (key) => {
      const clean = String(key || "").trim();
      if (!clean || BLOCKED_KEYS.has(clean)) return;
      const lower = clean.toLowerCase();
      if (discovered.has(lower)) return;
      discovered.add(lower);
      discoveredOrder.push(clean);
    };

    const records = await Record.find(filter).sort({ uploadedAt: -1 }).lean();

    const rows = records.map((doc) => {
      const flat = flattenRecord(doc) || {};
      const row = { ...flat };
      const raw = doc.rawData;
      if (raw && typeof raw === "object") {
        for (const k of Object.keys(raw)) {
          if (row[k] === undefined || row[k] === null || row[k] === "") row[k] = raw[k];
        }
      }
      if (isSecondaryAdmin) {
        row["Secondary Check Id"] =
          doc.secondaryCheckId ||
          raw?.secondaryCheckId ||
          raw?.["Secondary Check Id"] ||
          "";
        row["Insuff Remark"] = doc.insuffRemark || raw?.insuffRemark || "";
        row["Insuff Clear Date"] = "";
        const clearDate = doc.insuffClearDate || raw?.insuffClearDate || null;
        if (clearDate) {
          const d = new Date(clearDate);
          if (!isNaN(d.getTime())) {
            const dd = String(d.getDate()).padStart(2, "0");
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            row["Insuff Clear Date"] = `${dd}-${mm}-${d.getFullYear()}`;
          }
        }
      }
      return row;
    });

    records.forEach((doc) => {
      if (doc.rawData && typeof doc.rawData === "object") {
        Object.keys(doc.rawData).forEach(noteKey);
      }
    });
    rows.forEach((row) => {
      Object.keys(row).forEach((k) => {
        if (FLAT_DUPLICATE_KEYS.has(k)) return;
        noteKey(k);
      });
    });
    if (!discovered.has("status")) { discovered.add("status"); discoveredOrder.push("Status"); }

    const headers = [];
    const seen = new Set();
    PRIORITY_COLUMNS.forEach((col) => {
      const lower = col.toLowerCase();
      if (discovered.has(lower) && !seen.has(lower)) { seen.add(lower); headers.push(col); }
    });
    discoveredOrder.forEach((col) => {
      const lower = col.toLowerCase();
      if (!seen.has(lower)) { seen.add(lower); headers.push(col); }
    });

    // Secondary-admin-only columns, even if a stray raw Excel column
    // happened to collide with one of these names for another tenant —
    // superadmin's export must never show them.
    const SECONDARY_ADMIN_ONLY_COLUMNS = new Set([
      "secondary check id", "insuff remark", "insuff clear date",
    ]);
    const finalHeaders = isSecondaryAdmin
      ? headers
      : headers.filter((h) => !SECONDARY_ADMIN_ONLY_COLUMNS.has(h.toLowerCase()));

    // Date-text canonicalization (DD-MM-YYYY -> DD/MM/YYYY, forced Text
    // number format so no viewer ever re-interprets it) and the actual
    // workbook build + zip compression both happen in a worker thread, not
    // here — see workers/exportWorker.js. json_to_sheet + XLSX.write
    // together block Node's single event loop for 15-25+ seconds for a
    // tenant this size; every other request (every other user, every
    // polling call) queues up behind that, and the export's own response
    // write can itself stall badly enough to surface as a dropped
    // connection in the browser ("net::ERR_FAILED") even though the server
    // logged 200. Running it on a separate thread keeps the main server
    // fully responsive the whole time and lets this response actually
    // flush without contention.
    const aoa = [finalHeaders, ...rows.map((row) => finalHeaders.map((col) => row[col]))];

    const buf = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL("../workers/exportWorker.js", import.meta.url), {
        workerData: { aoa },
      });
      worker.once("message", (arrayBuffer) => resolve(Buffer.from(arrayBuffer)));
      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (code !== 0) reject(new Error(`Export worker exited with code ${code}`));
      });
    });

    res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.set("Content-Disposition", `attachment; filename="records_export_${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error("exportFullDetail error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ───────────────────────── ADD RECORD ───────────────────────── */

export async function addRecord(req, res) {
  try {
    const body = req.body || {};

    // Duplicate-record prevention — mirrors the same check in uploadExcel
    // (bulk upload), added here too since "Upload Daily Excel" creates
    // records one at a time through this endpoint instead. Its own
    // client-side duplicate check only compares against whatever's already
    // loaded in the browser (incomplete under server-side pagination) and
    // requires every single column to match exactly, so a trivial
    // difference (e.g. extra whitespace in a name) lets a real duplicate
    // through. This is the reliable backstop: same Check Id, same tenant,
    // reject outright rather than silently creating a second record.
    //
    // Also requires Address to match (when both rows have one) before
    // treating it as a duplicate — some clients genuinely reuse the same
    // Check Id across multiple distinct cases at different addresses (e.g.
    // multiple site-visit attempts under one case number); Check Id alone
    // was rejecting those as false-positive duplicates. Two rows with the
    // same Check Id AND the same address are still correctly blocked.
    const addRecordCheckId =
      body["Check Id"] || body["Check ID"] || body["CheckId"] ||
      body["Case ID"] || body["CaseID"] ||
      body.rawData?.["Check Id"] || body.rawData?.["Case ID"];
    // Set below (only when both a Check Id and Address are present) and
    // saved on the doc — backs the sparse unique index on Record.dedupeKey.
    // The find-then-create check just above/below this is a fast, friendly
    // rejection for the common case, but it can't stop two identical rows
    // in the same large concurrent batch from both passing the check before
    // either has saved. The unique index is the atomic backstop for that
    // race — caught via the try/catch around Record.create below.
    // Secondary admin's duplicate check additionally requires Secondary
    // Check Id to match (when either side has one set) — same Check Id at
    // the same address can still be a genuinely different case for them,
    // distinguished by their own Secondary Check Id. Super admin has no
    // such field, so this never changes their behavior.
    const isSecondaryAdminAddRecord = String(req.user?.role || "").trim().toLowerCase() === "admin";

    let dedupeKey;
    if (addRecordCheckId) {
      const normalizeCheckId = (v) => {
        let s = String(v === undefined || v === null ? "" : v).trim();
        s = s.replace(/\.0+$/, "");
        return s.toLowerCase();
      };
      const normalizeAddress = (v) =>
        String(v === undefined || v === null ? "" : v).replace(/\s+/g, " ").trim().toLowerCase();
      const targetKey = normalizeCheckId(addRecordCheckId);
      const addRecordAddress = normalizeAddress(
        body["Address"] || body.rawData?.["Address"] || ""
      );
      const addRecordSecondaryCheckId = normalizeCheckId(
        body["Secondary Check Id"] || body.secondaryCheckId || body.rawData?.["Secondary Check Id"] || ""
      );
      const addRecordTenantId = req.user?.tenantId || body.tenantId || null;
      // Check Id may be stored as a string or a number, so this can't be a
      // single normalized-equality query — narrow with $in on the raw
      // possible representations, then confirm the exact match in memory
      // against that small scoped set.
      const candidates = await Record.find({
        tenantId: addRecordTenantId,
        $or: [
          { "rawData.Check Id": { $in: [addRecordCheckId, String(addRecordCheckId), Number(addRecordCheckId)] } },
          { "rawData.Case ID": { $in: [addRecordCheckId, String(addRecordCheckId), Number(addRecordCheckId)] } },
        ],
      })
        .select("rawData.Check Id rawData.Case ID rawData.Address rawData.Secondary Check Id secondaryCheckId candidateName status")
        .lean();
      const existingDup = candidates.find((r) => {
        const key = normalizeCheckId(r.rawData?.["Check Id"] || r.rawData?.["Case ID"] || "");
        if (key !== targetKey) return false;
        if (isSecondaryAdminAddRecord && addRecordSecondaryCheckId) {
          const existingSecondaryCheckId = normalizeCheckId(
            r.secondaryCheckId || r.rawData?.["Secondary Check Id"] || ""
          );
          // The INCOMING row is explicitly tagged with a Secondary Check Id
          // (this tenant only started using the field recently, so most
          // older existing records have none at all) — treat that as the
          // tiebreaker whenever it's present: only an existing record that
          // carries the SAME Secondary Check Id is the same case. An
          // existing record with none, or a different one, is not a
          // duplicate even if Check Id + Address both match. Only when the
          // incoming row itself has no Secondary Check Id do we fall back
          // to the old Check Id + Address-only comparison below.
          if (addRecordSecondaryCheckId !== existingSecondaryCheckId) {
            return false;
          }
        }
        // No address on either side to compare — fall back to Check-Id-only
        // match (original behavior), rather than assume they're different.
        if (!addRecordAddress) return true;
        const existingAddress = normalizeAddress(r.rawData?.["Address"] || "");
        if (!existingAddress) return true;
        return existingAddress === addRecordAddress;
      });
      if (existingDup) {
        return res.status(409).json({
          error: `A case with Check Id "${addRecordCheckId}" already exists at the same address (${existingDup.candidateName || "no name"}, status: ${existingDup.status || "Pending"}). Not creating a duplicate.`,
        });
      }
      if (addRecordAddress) {
        dedupeKey = isSecondaryAdminAddRecord && addRecordSecondaryCheckId
          ? `${addRecordTenantId}::${targetKey}::${addRecordSecondaryCheckId}::${addRecordAddress}`
          : `${addRecordTenantId}::${targetKey}::${addRecordAddress}`;
      }
    }

    // A row can arrive already marked Closed directly in the uploaded Excel
    // (never goes through the single-row status dropdown or Bulk Update, so
    // neither of those auto-date-stamping paths ever runs for it). Without a
    // Completed Date, Cost Summary can't bucket the case into a month and
    // shows it under "Unknown" — mirror the same auto-stamp those other two
    // paths already apply when closing leaves no completed date behind.
    const resolvedStatus = normalizeStatus(body.Status || body.status || "Pending");
    const CLOSED_DATE_KEYS = [
      "Completed Date", "Complete Date", "Completion Date",
      "Closed Date", "Close Date", "Case Closed Date",
      "Vendor Close Date", "Vendor Completed Date", "Vendor Closed Date",
    ];
    const hasCompletedDate =
      CLOSED_DATE_KEYS.some((k) => body[k] || body.rawData?.[k]) ||
      body.completedDate || body.closedDate ||
      body.rawData?.completedDate || body.rawData?.closedDate;
    const autoCompletedDate =
      resolvedStatus === "Closed" && !hasCompletedDate ? todayStr() : null;

    // Canonicalize whatever Assigned Date value arrived (any format, any
    // separator) into one consistent string + the real Date, instead of
    // storing the client's raw value verbatim — see resolveAssignedDate.
    // strict (secondary admin only) rejects a genuinely ambiguous date
    // outright instead of guessing DD/MM.
    const addRecordAssignedInput =
      body["Assigned Date"] || body["Assign Date"] || body.assignedDate;
    // Applies to every role now, super admin included — same as uploadExcel.
    const addRecordStrictDates = true;
    const resolvedAssignedDate = resolveAssignedDate(addRecordAssignedInput, addRecordStrictDates);
    const assignedDateRejected =
      !resolvedAssignedDate && addRecordStrictDates && addRecordAssignedInput;

    let doc;
    try {
      doc = await Record.create({
      ...body,
      dedupeKey,
      ...(autoCompletedDate ? {
        "Completed Date": autoCompletedDate,
        completedDate:    autoCompletedDate,
        closedDate:       autoCompletedDate,
      } : {}),
      ...(resolvedAssignedDate ? {
        "Assigned Date": resolvedAssignedDate.str,
        assignedDate:    resolvedAssignedDate.date,
      } : assignedDateRejected ? {
        // Rejected as ambiguous (strict mode) — blanked rather than left as
        // whatever ambiguous text body["Assigned Date"] carried, so it can't
        // resurface through later display/export re-parsing it.
        "Assigned Date": "",
        "Assign Date": "",
      } : {}),

      uploadedBy:
        req.user?.email || "manual",

      tenantId:
        req.user?.tenantId ||
        body.tenantId ||
        null,

      uploadBatch:   `manual_${Date.now()}`,
      dailyUploadId: body.dailyUploadId || "", // shared across all records from one daily upload session
      uploadedAt:    new Date(),

      clientName:
        body["Client Name"] ||
        body.clientName ||
        "",

      candidateName:
        body["Candidate Name"] ||
        body.candidateName ||
        "",

      checkName:
        body["Check Name"] ||
        body.checkName ||
        "",

      status: resolvedStatus,

      city:
        body.City ||
        body.city ||
        "",

      state:
        body.State ||
        body.state ||
        "",

      rate:
        Number(body.rate || 0) || 0,

      agent:
        body.agent || "",

      assignDate:
        body.assignDate || "",

      extraApproved:
        body.extraApproved || false,

      extraAmount:
        Number(body.extraAmount || 0) || 0,

      rawData: {
        ...body,
        Status: resolvedStatus,
        status: resolvedStatus,
        ...(autoCompletedDate ? {
          "Completed Date": autoCompletedDate,
          completedDate:    autoCompletedDate,
          closedDate:       autoCompletedDate,
        } : {}),
        ...(resolvedAssignedDate ? {
          "Assigned Date": resolvedAssignedDate.str,
        } : assignedDateRejected ? {
          "Assigned Date": "",
          "Assign Date": "",
        } : {}),
      },
      });
    } catch (createErr) {
      // Atomic backstop for the race condition the find-check above can't
      // catch: two identical rows in the same large concurrent batch both
      // passing the check before either has saved. The unique index on
      // dedupeKey rejects the second write outright — surface it as the
      // same friendly duplicate message instead of a raw 500.
      if (createErr?.code === 11000 && createErr?.keyPattern?.dedupeKey) {
        return res.status(409).json({
          error: `A case with Check Id "${addRecordCheckId}" already exists at the same address. Not creating a duplicate.`,
        });
      }
      throw createErr;
    }

    res.status(201).json({
      ...flattenRecord(doc),
      ...(assignedDateRejected ? { assignedDateRejected: true, assignedDateRejectedValue: String(addRecordAssignedInput) } : {}),
    });
  } catch (err) {
    console.error("addRecord error:", err.message);

    res.status(500).json({
      error: err.message,
    });
  }
}

/* ───────────────────────── UPDATE RECORD ───────────────────────── */

export async function updateRecord(req, res) {
  try {
    const body = req.body || {};

    // Normalize once, up front, so the same corrected value flows into both
    // the top-level field and rawData below (both are built from `body`).
    if (body.specialBillingDate !== undefined) {
      try {
        body.specialBillingDate = normalizeSpecialBillingDateOrThrow(body.specialBillingDate);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    const existing = await Record.findById(
      req.params.id
    );

    if (!existing) {
      return res.status(404).json({
        error: "Record not found",
      });
    }

    if (!canUserAccessRecord(req, existing)) {
      return res.status(403).json({
        error: "Not allowed for this record",
      });
    }

    // Only an explicit top-level Status/status counts as an intentional status
    // change. body.rawData.Status/status is NOT used as a signal here — rawData
    // is resent as a full snapshot on almost every unrelated edit (Agent, Rate,
    // Assign Date, any single-cell edit), and it can carry a stale cached status
    // value from before a real status change. Falling back to it previously
    // meant an unrelated edit could silently revert a just-set "Closed" back to
    // "Pending" with no corresponding audit entry.
    const statusFromBody =
      body.Status !== undefined
        ? body.Status
        : body.status !== undefined
        ? body.status
        : undefined;

    const hasStatusUpdate = statusFromBody !== undefined;
    const finalStatus = hasStatusUpdate
      ? normalizeStatus(statusFromBody)
      : normalizeStatus(existing.status || existing.rawData?.Status || existing.rawData?.status || "Pending");

    const updatedRawData = {
      ...(existing.rawData || {}),
      ...(body.rawData || {}),
      ...body,
      ...(hasStatusUpdate ? { Status: finalStatus, status: finalStatus } : {}),
    };

    delete updatedRawData._id;
    delete updatedRawData.__v;

    const update = {
      ...body,
      rawData: updatedRawData,
    };

    delete update._id;
    delete update.__v;
    delete update.tenantId;
    delete update.uploadedBy;
    delete update.uploadBatch;
    delete update.dailyUploadId; // immutable — set once at import, never overwritten
    delete update.uploadedAt;

    if (body["Client Name"] || body.clientName) {
      update.clientName =
        body["Client Name"] ||
        body.clientName;
    }

    if (
      body["Candidate Name"] ||
      body.candidateName
    ) {
      update.candidateName =
        body["Candidate Name"] ||
        body.candidateName;
    }

    if (body["Check Name"] || body.checkName) {
      update.checkName =
        body["Check Name"] ||
        body.checkName;
    }

    if (hasStatusUpdate) {
      update.status = finalStatus;
      update.Status = finalStatus;
      update.rawData = {
        ...(update.rawData || {}),
        Status: finalStatus,
        status: finalStatus,
      };
    }

    if (body.rate !== undefined) {
      update.rate =
        Number(body.rate) || 0;
    }

    if (body.agent !== undefined) {
      update.agent = body.agent;
    }

    // Canonicalize Assigned Date the same way addRecord does, instead of
    // letting update/updatedRawData's `...body` spread pass through
    // whatever raw string the client currently has cached — that's exactly
    // the mechanism (same as the earlier Status-reversion bug) that kept
    // re-stamping an already-ambiguous/wrong format on every unrelated edit.
    // Re-running this on every save is self-healing: even a stale cached
    // value gets re-parsed with the correct DD/MM rule and normalized.
    const assignedDateInput =
      body["Assigned Date"] ?? body["Assign Date"] ??
      body.rawData?.["Assigned Date"] ?? body.rawData?.["Assign Date"] ??
      body.assignedDate;
    const resolvedAssignedDate = resolveAssignedDate(assignedDateInput);
    if (resolvedAssignedDate) {
      update["Assigned Date"] = resolvedAssignedDate.str;
      update.assignedDate = resolvedAssignedDate.date;
      update.rawData = {
        ...(update.rawData || {}),
        "Assigned Date": resolvedAssignedDate.str,
      };
    }

    if (body.assignDate !== undefined) {
      update.assignDate =
        body.assignDate;
    }

    if (body.extraApproved !== undefined) {
      update.extraApproved =
        body.extraApproved;
    }

    if (body.extraAmount !== undefined) {
      update.extraAmount =
        Number(body.extraAmount) || 0;
    }

    if (body.isSpecialCase !== undefined) {
      if (req.user.role !== "superadmin") {
        return res.status(403).json({ error: "Only super admin can mark special cases" });
      }
      update.isSpecialCase = !!body.isSpecialCase;
    }

    if (body.specialBillingDate !== undefined) {
      if (req.user.role !== "superadmin") {
        return res.status(403).json({ error: "Only super admin can set special billing date" });
      }
      update.specialBillingDate = body.specialBillingDate
        ? new Date(body.specialBillingDate)
        : null;
    }

    if (body.reportFile !== undefined) {
      update.reportFile =
        body.reportFile;
    }

    if (body.reportFileName !== undefined) {
      update.reportFileName =
        body.reportFileName;
    }

    if (body.reportUploaded !== undefined) {
      update.reportUploaded =
        body.reportUploaded;
    }

    if (body.reportUploadedAt !== undefined) {
      update.reportUploadedAt =
        body.reportUploadedAt;
    }

    if (body.reportUploadedBy !== undefined) {
      update.reportUploadedBy =
        body.reportUploadedBy;
    }

    // Guard against legacy corrupted date values blocking unrelated saves.
    // Some old records have a malformed string in a Date-typed field (e.g.
    // a stray leading backtick from a bad historical Excel import). The
    // frontend always re-sends whatever value already exists on the row for
    // these fields, so without this guard a record with one bad legacy date
    // would fail EVERY future status update forever with a Mongoose cast
    // error, even when that save has nothing to do with the bad field. If a
    // value here can't parse as a real date, drop it from this update —
    // the already-stored value is left exactly as it was, and the rest of
    // the save proceeds normally.
    for (const f of ["assignedDate", "insuffDate", "insuffClearDate", "reportUploadedAt", "reportSentAt", "specialBillingDate"]) {
      if (update[f] !== undefined && update[f] !== null && update[f] !== "" && isNaN(new Date(update[f]).getTime())) {
        delete update[f];
      }
    }

    const updated =
      await Record.findByIdAndUpdate(
        req.params.id,
        { $set: update },
        { new: true }
      );

    // Non-blocking audit entry — status-change only, never breaks the main update
    if (hasStatusUpdate) {
      StatusAudit.create({
        recordId:       existing._id,
        clientName:     existing.clientName || existing.rawData?.["Client Name"] || "",
        candidateName:  existing.candidateName || existing.rawData?.["Candidate Name"] || "",
        checkId:        existing.rawData?.["Check Id"] || existing.rawData?.["Case ID"] || "",
        oldStatus:      normalizeStatus(existing.status || existing.rawData?.Status || existing.rawData?.status || "Pending"),
        newStatus:      finalStatus,
        changedByEmail: req.user?.email || "unknown",
        changedByRole:  req.user?.role  || "unknown",
        tenantId:       existing.tenantId ?? null,
        ownerAdminEmail: req.user?.ownerAdminEmail || "",
        timestamp:      new Date(),
      }).catch(err => console.warn("[statusAudit] write failed:", err.message));
    }

    res.json(
      flattenRecord(updated)
    );
  } catch (err) {
    console.error("updateRecord error:", err.message);

    res.status(500).json({
      error: err.message,
    });
  }
}

/* ───────────────────────── DELETE RECORD ───────────────────────── */

export async function deleteRecord(req, res) {
  try {
    const existing = await Record.findById(
      req.params.id
    );

    if (!existing) {
      return res.status(404).json({
        error: "Record not found",
      });
    }

    if (!canUserAccessRecord(req, existing)) {
      return res.status(403).json({
        error: "Not allowed for this record",
      });
    }

    await Record.findByIdAndDelete(
      req.params.id
    );

    res.json({
      message: "Deleted",
    });
  } catch (err) {
    console.error("deleteRecord error:", err.message);

    res.status(500).json({
      error: err.message,
    });
  }
}

/* ───────────────────────── DELETE BATCH ───────────────────────── */

export async function deleteBatch(req, res) {
  try {
    const scopeFilter =
      getScopeFilter(req, "");

    if (
      req.user.role === "superadmin" &&
      !scopeFilter.tenantId
    ) {
      scopeFilter.tenantId = null;
    }

    const filter = {
      uploadBatch: req.params.batchId,
      ...scopeFilter,
    };

    const result =
      await Record.deleteMany(filter);

    res.json({
      message: "Batch deleted",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("deleteBatch error:", err.message);

    res.status(500).json({
      error: err.message,
    });
  }
}

/* ───────────────────────── STATS ───────────────────────── */

export async function getStats(req, res) {
  try {
    let filter = getScopeFilter(req, "");

    if (
      req.user.role === "superadmin" &&
      filter.tenantId === undefined
    ) {
      filter.tenantId = null;
    }

    // Optional, additive — scopes the counts to one client (e.g. Records
    // page status pills when a specific "Filter by Client" is selected),
    // same regex match getRecords already uses for clientName.
    const clientName = req.query?.clientName;
    if (clientName) {
      filter.clientName = { $regex: safeTrim(clientName), $options: "i" };
    }

    // Optional, additive — same allocation-scoping getRecords already
    // supports, reused here so a team member's Dashboard counts can be
    // fetched directly from the server instead of scanning their entire
    // eager-loaded dataset just to count a handful of allocated rows.
    if (req.query?.scopeToAllocations === "true" && req.user?.role === "team") {
      const allocFilter = await buildAllocationScopeFilter(req.user);
      if (!allocFilter) {
        return res.json({ total: 0, sent: 0, closed: 0, pending: 0, insuff: 0, insuffClear: 0, hold: 0, stop: 0 });
      }
      filter.$and = [...(filter.$and || []), allocFilter];
    }

    const [
      total,
      sent,
      closed,
      pending,
      insuff,
      insuffClear,
      hold,
      stop,
    ] = await Promise.all([
      Record.countDocuments(filter),
      Record.countDocuments({ ...filter, status: /sent/i }),
      Record.countDocuments({ ...filter, status: /closed/i }),
      Record.countDocuments({ ...filter, status: /pending/i }),
      // Anchored ONLY for this pair — "Insuff" must not also count "Insuff
      // Clear" rows now that it's a separate, distinct status. Every other
      // bucket here is untouched, still the original loose substring match.
      Record.countDocuments({ ...filter, status: /^insuff$/i }),
      Record.countDocuments({ ...filter, status: /^insuff clear$/i }),
      Record.countDocuments({ ...filter, status: /hold/i }),
      Record.countDocuments({ ...filter, status: /stop/i }),
    ]);

    res.json({
      total,
      sent,
      closed,
      pending,
      insuff,
      insuffClear,
      hold,
      stop,
    });
  } catch (err) {
    console.error("getStats error:", err.message);

    res.status(500).json({
      error: err.message,
    });
  }
}

/* ───────────────────────── NAME LISTS (light) ─────────────────────────
   Distinct client/vendor/check names + per-name record counts, computed via
   aggregation instead of scanning full row data. Lets the Records-page
   filter dropdown, sidebar badges, and the Allocations page get their name
   lists without depending on the full eager-loaded dataset. Same scoping as
   getStats/getRecords (getScopeFilter) — additive, no other behavior change. */
export async function getNameLists(req, res) {
  try {
    let filter = getScopeFilter(req, req.query?.tenantId || "");

    if (req.user.role === "superadmin" && filter.tenantId === undefined) {
      filter.tenantId = null;
    }

    const [clientRows, checkRows, vendorRows] = await Promise.all([
      Record.aggregate([
        { $match: { ...filter, clientName: { $nin: ["", null] } } },
        { $group: { _id: "$clientName", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Record.aggregate([
        { $match: { ...filter, checkName: { $nin: ["", null] } } },
        { $group: { _id: "$checkName", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Record.aggregate([
        { $match: filter },
        {
          $addFields: {
            _vendorName: {
              $ifNull: [
                "$rawData.Vendor Name",
                {
                  $ifNull: [
                    "$rawData.vendor name",
                    {
                      $ifNull: [
                        "$rawData.VendorName",
                        {
                          $ifNull: [
                            "$rawData.Vendor Company",
                            {
                              $ifNull: [
                                "$rawData.vendor company",
                                { $ifNull: ["$rawData.Vendor", "$rawData.vendor"] },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        { $match: { _vendorName: { $nin: ["", null] } } },
        { $group: { _id: "$_vendorName", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      clients: clientRows.map((r) => ({ name: r._id, count: r.count })),
      checks:  checkRows.map((r) => ({ name: r._id, count: r.count })),
      vendors: vendorRows.map((r) => ({ name: r._id, count: r.count })),
    });
  } catch (err) {
    console.error("getNameLists error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ───────────────────────── DAILY CLOSED CASES — LIGHTWEIGHT SUMMARY ─────
   Powers the Dashboard's "Daily Closed Cases" widget. It used to call the
   regular getRecords({status:"closed", limit:100000}) — shipping every
   field (including the full rawData blob) of every closed record just to
   group them by date and show a per-day count, which got slower as the
   closed-case count grew into the thousands. This returns only the handful
   of fields the widget actually needs up front: status, _id, and every
   possible "completed date" field name the frontend already knows how to
   read (both top-level and nested under rawData). The actual date PARSING
   (Excel serials, DD/MM vs MM/DD disambiguation, etc.) deliberately stays
   in the existing frontend parseDate()/getCompletedDateRaw() — that logic
   is already correct and re-implementing its fuzzy heuristics inside an
   aggregation pipeline would risk silently misdating or dropping cases.
   Full row data for one specific date is only fetched later, on demand,
   when the admin clicks Download for that date (via getRecords?ids=...). */
export async function getClosedCasesSummary(req, res) {
  try {
    let filter = getScopeFilter(req, req.query?.tenantId || "");

    if (req.user.role === "superadmin" && filter.tenantId === undefined) {
      filter.tenantId = null;
    }

    if (req.query?.scopeToAllocations === "true" && req.user?.role === "team") {
      const allocFilter = await buildAllocationScopeFilter(req.user);
      if (!allocFilter) return res.json([]);
      filter.$and = [...(filter.$and || []), allocFilter];
    }

    filter.status = { $regex: "closed", $options: "i" };

    const rows = await Record.aggregate([
      { $match: filter },
      {
        $project: {
          status: 1,
          Status: 1,
          STATUS: 1,
          "Case Status": 1,
          "BGV Status": 1,
          "Verification Status": 1,
          "Current Status": 1,
          "Completed Date": 1,
          "Complete Date": 1,
          completedDate: 1,
          closedDate: 1,
          "Closed Date": 1,
          "Vendor Close Date": 1,
          "rawData.Completed Date": 1,
          "rawData.Complete Date": 1,
          "rawData.completedDate": 1,
          "rawData.closedDate": 1,
          "rawData.Closed Date": 1,
          "rawData.Vendor Close Date": 1,
        },
      },
    ]);

    res.json(rows);
  } catch (err) {
    console.error("getClosedCasesSummary error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ───────────────────────── BULK UPDATE — MATCH BY CHECK ID ─────────────
   Bulk Update by Excel needs to match a few hundred/thousand uploaded rows
   against every scoped record by Check Id. Doing that in the browser means
   shipping the ENTIRE dataset (every record, full rawData) to the client
   first — exactly the "load everything into the tab" pattern that caused
   repeated OOM crashes on the Records page, which server pagination was
   built to eliminate. This endpoint does the matching here instead: every
   scoped record is loaded into server memory (cheap and safe for a single
   request, unlike a browser tab juggling rendering/other state too), and
   only the matched subset is sent back — never the full dataset. */
export async function bulkMatchByCheckId(req, res) {
  try {
    const { checkIds } = req.body;
    if (!Array.isArray(checkIds) || checkIds.length === 0) {
      return res.status(400).json({ error: "checkIds array required" });
    }

    let filter = getScopeFilter(req, req.query?.tenantId || "");
    if (req.user.role === "superadmin" && filter.tenantId === undefined) {
      filter.tenantId = null;
    }

    // Mirrors the frontend's normalizeIdForMatch exactly: string, trimmed,
    // a trailing ".0"/".00" from a numeric-to-string conversion stripped,
    // lowercase — so a Check Id stored as either a number or a string, and
    // a file that sends it as a number, all compare identically.
    const normalizeId = (v) => {
      let s = String(v === undefined || v === null ? "" : v).trim();
      s = s.replace(/\.0+$/, "");
      return s.toLowerCase();
    };

    const getExistingVal = (record, colName) => {
      if (!record || !colName) return "";
      if (record[colName] !== undefined && record[colName] !== null) return record[colName];
      if (record.rawData?.[colName] !== undefined && record.rawData?.[colName] !== null) return record.rawData[colName];
      const cl = String(colName).trim().toLowerCase();
      const dk = Object.keys(record).find((k) => String(k).trim().toLowerCase() === cl);
      if (dk !== undefined) return record[dk];
      const rk = Object.keys(record.rawData || {}).find((k) => String(k).trim().toLowerCase() === cl);
      return rk !== undefined ? record.rawData[rk] : "";
    };
    const getExistingCheckId = (record) =>
      getExistingVal(record, "Check Id") || getExistingVal(record, "Case ID");

    const allRecords = await Record.find(filter).lean();

    const byNormalizedId = new Map();
    for (const record of allRecords) {
      const key = normalizeId(getExistingCheckId(record));
      if (!key) continue;
      const arr = byNormalizedId.get(key);
      if (arr) arr.push(record);
      else byNormalizedId.set(key, [record]);
    }

    const requestedKeys = [...new Set(checkIds.map(normalizeId).filter(Boolean))];

    const matched = [];
    const unmatchedKeys = [];
    const ambiguousKeys = [];

    for (const key of requestedKeys) {
      const hits = byNormalizedId.get(key) || [];
      if (hits.length === 1) {
        matched.push(hits[0]);
      } else if (hits.length === 0) {
        unmatchedKeys.push(key);
      } else {
        ambiguousKeys.push({ key, count: hits.length });
      }
    }

    res.json({ matched, unmatchedKeys, ambiguousKeys });
  } catch (err) {
    console.error("bulkMatchByCheckId error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ───────────────────────── REPORT FILE UPLOAD ───────────────────────── */

export async function uploadReportFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    const recordId =
      req.body.recordId ||
      req.body.id ||
      req.body.caseId ||
      req.body.checkId;

    if (
      !recordId ||
      !mongoose.Types.ObjectId.isValid(recordId)
    ) {
      return res.status(400).json({
        error: "Valid recordId required",
      });
    }

    const record = await Record.findById(
      recordId
    );

    if (!record) {
      return res.status(404).json({
        error: "Record not found",
      });
    }

    if (!canUserAccessRecord(req, record)) {
      return res.status(403).json({
        error:
          "Not allowed for this company record",
      });
    }

    // New uploads go straight to S3 — no local disk write at all. The safe
    // extension (not the raw original filename) keeps the S3 key predictable.
    const safeExt = path.extname(req.file.originalname) || ".pdf";
    const s3Key = `reports/${recordId}/${Date.now()}${safeExt}`;

    await uploadBufferToS3(req.file.buffer, s3Key, req.file.mimetype);

    // fileUrl now points at our own authed view endpoint (which resolves the
    // S3 key to a fresh presigned URL on demand) instead of a static path —
    // there is no local file for this record's report anymore.
    const fileUrl = `/api/upload/report-file/${recordId}`;

    const now = new Date();

    const updatedRawData = {
      ...(record.rawData || {}),

      reportFile: fileUrl,
      reportFileName: req.file.originalname,
      reportUploaded: true,
      reportUploadedAt: now,
      reportUploadedBy:
        req.user?.email || "unknown",
      reportS3Key: s3Key,
    };

    const updated =
      await Record.findByIdAndUpdate(
        recordId,
        {
          $set: {
            reportFile: fileUrl,
            reportFileName:
              req.file.originalname,

            reportUploaded: true,
            reportUploadedAt: now,
            reportUploadedBy:
              req.user?.email || "unknown",
            reportS3Key: s3Key,

            rawData: updatedRawData,
          },
        },
        { new: true }
      );

    res.json({
      message:
        "Report uploaded successfully",
      fileUrl,
      record: flattenRecord(updated),
    });
  } catch (err) {
    console.error(
      "uploadReportFile error:",
      err.message
    );

    res.status(500).json({
      error: err.message,
    });
  }
}

/* ───────────────────────── REPORT VIEW URL (S3 presigned OR legacy local) ───────────────────────── */

export async function getReportViewUrl(req, res) {
  try {
    const recordId = req.params.id;

    if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ error: "Valid record id required" });
    }

    const record = await Record.findById(recordId).lean();

    if (!record) {
      return res.status(404).json({ error: "Record not found" });
    }

    if (!canUserAccessRecord(req, record)) {
      return res.status(403).json({ error: "Not allowed for this company record" });
    }

    const s3Key = record.reportS3Key || record.rawData?.reportS3Key;

    if (s3Key) {
      const url = await getPresignedViewUrl(s3Key);
      return res.json({ url, source: "s3" });
    }

    // Legacy fallback — record predates the S3 migration and hasn't been
    // migrated yet; serve the same static local path as before.
    const legacyPath = record.reportFile || record.rawData?.reportFile;
    if (!legacyPath) {
      return res.status(404).json({ error: "No report uploaded for this record" });
    }

    const url = /^https?:\/\//i.test(legacyPath)
      ? legacyPath
      : `https://profeix.info${legacyPath}`;

    return res.json({ url, source: "local" });
  } catch (err) {
    console.error("getReportViewUrl error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ───────────────────────── SEND CASE MAIL USING GMAIL ───────────────────────── */
/* ───────────────────────── MAIL CONFIG HELPERS ───────────────────────── */

function getMailOwnerEmail(req) {
  const role = String(req.user?.role || "").toLowerCase();

  // Super admin sends from their own configured mail
  if (role === "superadmin") {
    return String(req.user?.email || "").toLowerCase().trim();
  }

  // Secondary/company admin sends from their own configured mail
  if (role === "admin") {
    return String(req.user?.email || "").toLowerCase().trim();
  }

  // Team member sends from owner admin mail if available
  if (role === "team") {
    return String(
      req.user?.ownerAdminEmail ||
        req.user?.adminEmail ||
        req.user?.email ||
        ""
    )
      .toLowerCase()
      .trim();
  }

  return String(req.user?.email || "").toLowerCase().trim();
}

// Flatten a MailConfig document into a list of sendable accounts.
// The legacy top-level fields are the "primary" account (id: "primary"),
// followed by any extra accounts in the `accounts` array (id: their _id).
function listMailAccounts(configDoc) {
  if (!configDoc) return [];
  const out = [];

  if (configDoc.smtpUser && configDoc.smtpPass) {
    out.push({
      id: "primary",
      label: configDoc.label || configDoc.fromName || configDoc.smtpUser,
      smtpHost: configDoc.smtpHost,
      smtpPort: configDoc.smtpPort,
      smtpSecure: configDoc.smtpSecure,
      smtpUser: configDoc.smtpUser,
      smtpPass: configDoc.smtpPass,
      fromName: configDoc.fromName,
      isActive: configDoc.isActive !== false,
    });
  }

  (configDoc.accounts || []).forEach((a) => {
    if (a && a.smtpUser && a.smtpPass) {
      out.push({
        id: String(a._id),
        label: a.label || a.fromName || a.smtpUser,
        smtpHost: a.smtpHost,
        smtpPort: a.smtpPort,
        smtpSecure: a.smtpSecure,
        smtpUser: a.smtpUser,
        smtpPass: a.smtpPass,
        fromName: a.fromName,
        isActive: a.isActive !== false,
      });
    }
  });

  return out;
}

async function getTransporterForUser(req, selectedId = "") {
  const ownerEmail = getMailOwnerEmail(req);

  let configDoc = null;
  if (ownerEmail) {
    configDoc = await MailConfig.findOne({ ownerEmail }).lean();
  }

  const accounts = listMailAccounts(configDoc).filter((a) => a.isActive);

  // Use the selected account if a valid id was passed; otherwise the first active one.
  let chosen = null;
  if (selectedId) {
    chosen = accounts.find((a) => a.id === String(selectedId)) || null;
  }
  if (!chosen) chosen = accounts[0] || null;

  // If no DB account is available, fall back to .env (unchanged behavior)
  if (!chosen) {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      throw new Error(
        `Mail config not found for ${ownerEmail || "this user"} and MAIL_USER/MAIL_PASS fallback is missing`
      );
    }

    return {
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      transporter: nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
      }),
      ownerEmail,
      source: "env-fallback",
      account: null, // no IMAP for env-fallback (Gmail App Password path)
    };
  }

  return {
    from: chosen.fromName
      ? `"${chosen.fromName}" <${chosen.smtpUser}>`
      : chosen.smtpUser,

    transporter: nodemailer.createTransport({
      host: chosen.smtpHost || "smtp.gmail.com",
      port: Number(chosen.smtpPort || 465),
      secure: chosen.smtpSecure !== false,
      auth: {
        user: chosen.smtpUser,
        pass: chosen.smtpPass,
      },
    }),

    ownerEmail,
    source: "db-mail-config",
    account: chosen, // exposed for IMAP Sent-folder copy
  };
}

// GET /api/upload/mail-configs
// Returns the active mail accounts (WITHOUT passwords) the current user can
// send from, so the frontend can show a picker.
export async function listMailAccountsForUser(req, res) {
  try {
    const ownerEmail = getMailOwnerEmail(req);
    const configDoc = ownerEmail
      ? await MailConfig.findOne({ ownerEmail }).lean()
      : null;

    const accounts = listMailAccounts(configDoc)
      .filter((a) => a.isActive)
      .map((a) => ({
        id: a.id,
        label: a.label,
        smtpUser: a.smtpUser,
        fromName: a.fromName,
      }));

    return res.json({ ownerEmail, accounts });
  } catch (err) {
    console.error("listMailAccountsForUser error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

export async function sendCaseMail(req, res) {
  try {
    const { recordId, to, cc, subject, message, mailConfigId, source } = req.body || {};
    const isClientMail = source === "client";

    if (!to) {
      return res.status(400).json({
        error: "Recipient email required",
      });
    }

    if (
      !recordId ||
      !mongoose.Types.ObjectId.isValid(recordId)
    ) {
      return res.status(400).json({
        error: "Valid recordId required",
      });
    }

    const record = await Record.findById(recordId);

    if (!record) {
      return res.status(404).json({
        error: "Record not found",
      });
    }

    if (!canUserAccessRecord(req, record)) {
      return res.status(403).json({
        error: "Not allowed for this record",
      });
    }

    const row = flattenRecord(record);

    // Assigned date: prefer the string field, fall back to the Date field
    const assignedDateStr = row.assignDate
      ? fmtDate(row.assignDate)
      : fmtDate(record.assignedDate);

    // Closed date: last StatusAudit entry where status became Closed/Completed
    const closedAudit = await StatusAudit.findOne({
      recordId: record._id,
      newStatus: /closed|complete/i,
    })
      .sort({ timestamp: -1 })
      .lean();
    const closedDateStr = closedAudit ? fmtDate(closedAudit.timestamp) : "";

    const rawData = record.rawData || {};
    const excelData = [
      {
        "Candidate Name": row["Candidate Name"] || "",
        "Check Name": row["Check Name"] || "",
        Status: row.Status || row.status || "",
        Address: rawData["Address"] || rawData["address"] || rawData["Full Address"] || "",
        City: row.City || row.city || rawData["City"] || rawData["District"] || "",
        State: row.State || row.state || rawData["State"] || "",
        Pincode: rawData["Pincode"] || rawData["pincode"] || rawData["Pin Code"] || rawData["PIN"] || rawData["Zip"] || "",
        "Case ID": row["Case ID"] || row["Check Id"] || "",
        "Assigned Date": assignedDateStr,
        "Closed Date": closedDateStr,
        "Report Uploaded": row.reportUploaded ? "Yes" : "No",
      },
    ];

    // Client mail: PDF only, no Excel attachment.
    // Vendor/other mail: unchanged — Excel + PDF, exactly as before.
    const attachments = [];

    if (!isClientMail) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      XLSX.utils.book_append_sheet(wb, ws, "Case Details");

      const excelBuffer = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx",
      });

      attachments.push({
        filename: `BGV_Report_${row["Candidate Name"] || "Candidate"}.xlsx`,
        content: excelBuffer,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }

    if (!record.reportFile && !record.reportS3Key) {
      return res.status(400).json({
        error:
          "PDF report not found. Please re-upload/generate report first.",
      });
    }

    if (record.reportS3Key) {
      // Migrated/new report — pull the bytes from S3 for the attachment.
      const pdfBuffer = await downloadObjectBuffer(record.reportS3Key);
      attachments.push({
        filename: record.reportFileName || "report.pdf",
        content: pdfBuffer,
      });
    } else {
      // Legacy report — same local-disk resolution as before.
      const relativePath = String(record.reportFile).replace(/^\/+/, "");

      const possiblePaths = [
        path.join(__dirname, "..", relativePath),
        path.join(process.cwd(), relativePath),
        path.join(
          process.cwd(),
          "uploads",
          "reports",
          path.basename(relativePath)
        ),
      ];

      const pdfPath = possiblePaths.find((p) => fs.existsSync(p));

      if (!pdfPath) {
        return res.status(400).json({
          error:
            "PDF file missing on server. Please click Re-upload and upload report again.",
        });
      }

      attachments.push({
        filename:
          record.reportFileName ||
          path.basename(pdfPath),
        path: pdfPath,
      });
    }

      const mailer = await getTransporterForUser(req, mailConfigId);

    const mailOptions = {
      from: mailer.from,
      to,
      cc: cc || undefined,
      subject:
        subject ||
        `BGV Report - ${row["Candidate Name"] || "Candidate"}`,
      text:
        message ||
        (isClientMail
          ? `Dear Team,

Please find attached the BGV report.

Candidate: ${row["Candidate Name"] || "-"}
Check: ${row["Check Name"] || "-"}
Status: ${row.Status || row.status || "-"}
State: ${row.State || row.state || rawData["State"] || "-"}
Case ID: ${row["Case ID"] || row["Check Id"] || "-"}
Assigned Date: ${assignedDateStr || "-"}
Closed Date: ${closedDateStr || "-"}

Regards,
True Verification Services`
          : `Dear Team,

Please find attached the BGV case Excel and report.

Candidate: ${row["Candidate Name"] || "-"}
Check: ${row["Check Name"] || "-"}
Status: ${row.Status || row.status || "-"}

Regards,
True Verification Services`),
      attachments,
    };

    await mailer.transporter.sendMail(mailOptions);

    // Non-blocking: copy to sender's IMAP Sent folder (best-effort, never blocks response)
    if (mailer.account) {
      saveToSentFolder(mailer.account, mailOptions).catch(() => {});
    }

      return res.json({
      success: true,
      message: "Mail sent successfully",
      mailSource: mailer.source,
      mailOwner: mailer.ownerEmail,
    });
  } catch (err) {
    console.error("sendCaseMail error:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
}

/* ───────────────────────── COST SUMMARY VALIDATION MAIL ─────────────────
   Super-admin-only, additive — sends a plain-text summary email (client or
   vendor, for one month) using the same mail-sending mechanics as
   sendCaseMail above (getTransporterForUser + best-effort Sent-folder
   copy), just without an attachment. Nothing about report sending, Inbox,
   or any other mail path is touched. */
export async function sendValidationMail(req, res) {
  try {
    const { to, cc, subject, text, attachmentBase64, attachmentFilename } = req.body || {};

    if (!to || !String(to).trim()) {
      return res.status(400).json({ error: "Recipient (to) is required" });
    }
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Message body is required" });
    }

    const mailer = await getTransporterForUser(req);

    const mailOptions = {
      from: mailer.from,
      to: String(to).trim(),
      cc: cc && String(cc).trim() ? String(cc).trim() : undefined,
      subject: subject && String(subject).trim() ? String(subject).trim() : "Monthly Cost Validation",
      text: String(text),
      attachments: attachmentBase64
        ? [{
            filename: attachmentFilename || "validation.xlsx",
            content: attachmentBase64,
            encoding: "base64",
          }]
        : undefined,
    };

    await mailer.transporter.sendMail(mailOptions);

    if (mailer.account) {
      saveToSentFolder(mailer.account, mailOptions).catch(() => {});
    }

    return res.json({ success: true, message: "Validation mail sent successfully" });
  } catch (err) {
    console.error("sendValidationMail error:", err);
    return res.status(500).json({ error: err.message });
  }
}

/* ───────────────────────── WORD TO PDF CONVERT ───────────────────────── */

export async function convertDocToPdf(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No Word file uploaded",
      });
    }

    const inputPath = req.file.path;

    const ext = path
      .extname(req.file.originalname)
      .toLowerCase();

    if (![".doc", ".docx"].includes(ext)) {
      return res.status(400).json({
        error:
          "Only DOC/DOCX files are allowed",
      });
    }

    const outputDir =
      path.dirname(inputPath);

    await execFileAsync("libreoffice", [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      inputPath,
    ]);

    const pdfName =
      path.basename(
        inputPath,
        path.extname(inputPath)
      ) + ".pdf";

    const pdfPath = path.join(
      outputDir,
      pdfName
    );

    if (!fs.existsSync(pdfPath)) {
      return res.status(500).json({
        error:
          "Word to PDF conversion failed",
      });
    }

    return res.json({
      success: true,
      pdfName,
      fileUrl: `/uploads/reports/${pdfName}`,
    });
  } catch (err) {
    console.error(
      "convertDocToPdf error:",
      err
    );

    return res.status(500).json({
      error:
        err.message || "Conversion failed",
    });
  }
}

/* ───────────────────────── SENT REPORTS ───────────────────────── */

const SUPER_ADMIN_EMAIL_SR = "superadmin@tervies.com";

function normVendorKeySR(v) {
  return String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function getSentReports(req, res) {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    const adminEmail =
      role === "superadmin"
        ? SUPER_ADMIN_EMAIL_SR
        : String(req.user?.email || "").toLowerCase().trim();

    if (!adminEmail) return res.status(400).json({ error: "Admin email missing" });

    const tenantFilter =
      role === "superadmin"
        ? { $or: [{ tenantId: null }, { tenantId: "" }] }
        : { tenantId: req.user?.tenantId || null };

    // All team members under this admin's allocation bucket
    const stateDoc = await PortalState.findOne({ key: "allocations" }).lean();
    const bucket = stateDoc?.value?.[`vendorAllocations_${adminEmail}`] || {};
    let teamEmails = Object.keys(bucket);

    // Internal staff (isInternal=true or no-tenant/no-owner) may upload reports
    // without being in the vendor allocation bucket. Include them in SA's view.
    if (role === "superadmin") {
      const internalUsers = await User.find({
        role: "team",
        status: "approved",
        $or: [
          { isInternal: true },
          { tenantId: { $in: [null, ""] }, ownerAdminEmail: { $in: [null, ""] } },
        ],
      }).select("email").lean();
      const internalEmails = internalUsers
        .map(u => String(u.email || "").toLowerCase().trim())
        .filter(Boolean);
      teamEmails = [...new Set([...teamEmails, ...internalEmails])];
    }

    // vendor contact lookup map
    const vendorContacts = await VendorContact.find({}).lean();
    const vcByNorm = {};
    for (const vc of vendorContacts) {
      vcByNorm[normVendorKeySR(vc.vendorName)] = vc;
    }

    const memberVendorMap = {};
    for (const [memberEmail, vendors] of Object.entries(bucket)) {
      memberVendorMap[memberEmail] = Array.isArray(vendors) ? vendors : [];
    }

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    // Pending count — today only, unsent
    const pendingFilter = {
      ...tenantFilter,
      reportUploaded: true,
      reportUploadedAt: { $gte: startOfToday },
      reportUploadedBy: teamEmails.length ? { $in: teamEmails } : { $in: [] },
      reportSentAt: null,
    };
    const pendingCount = await Record.countDocuments(pendingFilter);

    // Full pending list (across all dates, not just today) — newest first
    const allPendingFilter = {
      ...tenantFilter,
      reportUploaded: true,
      reportUploadedBy: teamEmails.length ? { $in: teamEmails } : { $in: [] },
      reportSentAt: null,
    };
    const pendingList = await Record.find(allPendingFilter)
      .select(
        "_id clientName candidateName checkName status reportFile reportFileName " +
        "reportUploadedAt reportUploadedBy tenantId"
      )
      .sort({ reportUploadedAt: -1 })
      .limit(500)
      .lean();

    const enriched = pendingList.map((r) => {
      const uploaderEmail = String(r.reportUploadedBy || "").toLowerCase().trim();
      const vendorNames = memberVendorMap[uploaderEmail] || [];
      const primaryVendorName = vendorNames[0] || "";
      const vc = vcByNorm[normVendorKeySR(primaryVendorName)] || null;
      return {
        ...r,
        uploaderEmail,
        vendorName: primaryVendorName,
        vendorEmail: vc?.email || "",
        vendorCcList: vc?.ccList || [],
      };
    });

    return res.json({ pendingCount, pendingList: enriched });
  } catch (err) {
    console.error("getSentReports error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

export async function markReportSent(req, res) {
  try {
    const { recordId, channel = "email" } = req.body || {};

    if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ error: "Valid recordId required" });
    }

    const now = new Date();
    const updated = await Record.findOneAndUpdate(
      { _id: recordId, reportSentAt: null },
      { $set: { reportSentAt: now, reportSentBy: req.user?.email || "", reportSentChannel: channel } },
      { new: true }
    );

    if (!updated) {
      return res.json({ alreadySent: true, message: "Already marked as sent" });
    }

    return res.json({ success: true, reportSentAt: now });
  } catch (err) {
    console.error("markReportSent error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}