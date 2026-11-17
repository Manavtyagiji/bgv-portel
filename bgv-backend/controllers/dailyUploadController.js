// bgv-backend/controllers/dailyUploadController.js
// Additive only — does not touch uploadController.js or any existing collection.
//
// Extended: SA internal team members with vendor allocations can list and
// download their vendor-scoped, client-name-free view of daily uploads.
// All scoping is enforced here — the browser never receives another vendor's
// rows or any client name for team members.

import path from "path";
import fs   from "fs";
import { fileURLToPath } from "url";
import XLSX        from "xlsx";
import DailyUpload from "../models/DailyUpload.js";
import PortalState from "../models/PortalState.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const EXCEL_DIR       = path.join(__dirname, "..", "uploads-excel");
const SUPER_ADMIN_EMAIL = "superadmin@tervies.com"; // same constant as frontend

// ── Normalisation helpers ────────────────────────────────────────────────────

function normKey(v = "") {
  return String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Vendor column header keys — same list as getExcelVendorName in MyTable.jsx
const VENDOR_HEADERS = [
  "vendor name", "vendorname", "vendor company", "vendor company name", "vendor",
];

function isVendorHeader(h) {
  return VENDOR_HEADERS.includes(normKey(h));
}

// Client-name column key — same column MyTable.jsx strips via hideClientNameForVendorTeam
function isClientNameHeader(h) {
  return normKey(h) === "client name";
}

// ── Vendor allocation lookup ─────────────────────────────────────────────────

// Returns the vendor names (normalised) allocated to the requesting team member.
// Works for both SA's internal team (tenantId null/empty → SA's bucket) and
// company team members (ownerAdminEmail set → their admin's bucket).
// Returns [] for any non-team role or when no allocation exists.
async function getTeamMemberVendors(req) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role !== "team") return [];

  const memberEmail = String(req.user?.email || "").toLowerCase().trim();
  const hasNoTenant = !req.user?.tenantId;

  // SA's internal team has no tenantId → use SA's allocation bucket.
  // Company team members have ownerAdminEmail → use their admin's bucket.
  const adminEmail = hasNoTenant
    ? SUPER_ADMIN_EMAIL
    : String(req.user?.ownerAdminEmail || "").toLowerCase().trim();

  if (!adminEmail) return [];

  try {
    const doc = await PortalState.findOne({ key: "allocations" }).lean();
    if (!doc?.value) return [];
    const vendorMap = doc.value[`vendorAllocations_${adminEmail}`] || {};
    const vendors = vendorMap[memberEmail] || vendorMap[req.user?.email] || [];
    return Array.isArray(vendors)
      ? vendors.map(v => normKey(v)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

// ── Excel parsing / filtering ────────────────────────────────────────────────

// Reads the stored .xlsx, filters to rows matching vendorNames (normalised),
// strips the "Client Name" column, and returns:
//   { filteredBuf: Buffer, vendorRowCount: number }
// If the file cannot be parsed, throws.
function parseAndFilterExcel(filePath, vendorNames) {
  const vendorSet = new Set(vendorNames.map(v => normKey(v)).filter(Boolean));

  const wb  = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { filteredBuf: null, vendorRowCount: 0 };

  const ws = wb.Sheets[sheetName];

  // Convert to array-of-arrays to locate header row and columns
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (aoa.length < 2) return { filteredBuf: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), vendorRowCount: 0 };

  const headers = aoa[0].map(h => String(h ?? ""));

  // Find vendor and client-name column indices
  const vendorColIdx     = headers.findIndex(h => isVendorHeader(h));
  const clientNameColIdx = headers.findIndex(h => isClientNameHeader(h));

  // Filter data rows: keep row if it has a vendor that matches
  const headerRow   = [...headers];
  const filteredRows = [];

  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    const cellVendor = vendorColIdx >= 0 ? normKey(String(row[vendorColIdx] ?? "")) : "";
    if (vendorSet.size > 0 && !vendorSet.has(cellVendor)) continue;
    filteredRows.push([...row]);
  }

  // Strip client-name column from header and all rows
  let finalHeader = headerRow;
  let finalRows   = filteredRows;

  if (clientNameColIdx >= 0) {
    finalHeader = headerRow.filter((_, i) => i !== clientNameColIdx);
    finalRows   = filteredRows.map(r => r.filter((_, i) => i !== clientNameColIdx));
  }

  // Build new workbook
  const newWb  = XLSX.utils.book_new();
  const newAoa = [finalHeader, ...finalRows];
  const newWs  = XLSX.utils.aoa_to_sheet(newAoa);
  XLSX.utils.book_append_sheet(newWb, newWs, sheetName);

  const filteredBuf = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" });
  return { filteredBuf, vendorRowCount: filteredRows.length };
}

// ── Scope filter (unchanged original logic for SA / admin) ───────────────────

function getScopeFilter(req) {
  const role = String(req.user?.role || "").toLowerCase();
  // SA sees only their own uploads (tenantId null or empty — never another tenant's).
  if (role === "superadmin") return { $or: [{ tenantId: null }, { tenantId: "" }] };
  return { tenantId: req.user?.tenantId || null };
}

// ── POST /api/daily-uploads ──────────────────────────────────────────────────
// Receives the raw .xlsx file from the frontend after a successful daily import.
// Saves file to disk (already done by multer) and creates a DailyUpload document.
// Fire-and-forget from frontend — failure here does NOT affect already-imported rows.
export async function saveDailyExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { totalRows = 0, importedRows = 0, tenantId = "", dailyUploadId = "" } = req.body;

    const doc = await DailyUpload.create({
      originalFilename: req.file.originalname,
      filePath:         req.file.filename,
      uploaderEmail:    req.user?.email || "unknown",
      uploaderRole:     req.user?.role  || "",
      tenantId:         tenantId || req.user?.tenantId || "",
      totalRows:        Number(totalRows)    || 0,
      importedRows:     Number(importedRows) || 0,
      dailyUploadId:    dailyUploadId || "",
    });

    return res.json({ ok: true, id: doc._id });
  } catch (err) {
    console.error("saveDailyExcel error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── GET /api/daily-uploads ───────────────────────────────────────────────────
// Lists uploads newest-first, scoped by role/tenant.
// Internal team members with vendor allocations see only uploads that contain
// at least one of their vendor's rows (counts substituted with vendor-row counts).
// Internal team members with NO vendor allocation get an empty list.
export async function listDailyUploads(req, res) {
  try {
    // ── Team member path (SA internal team + company team, vendor-allocated) ──
    if (String(req.user?.role || "").toLowerCase() === "team") {
      const vendors = await getTeamMemberVendors(req);

      if (vendors.length === 0) {
        return res.json({ uploads: [] }); // no allocation → nothing to show
      }

      // Scope to their own tenant's uploads only (never another tenant's).
      // SA internal team: tenantId null/empty. Company team: their tenantId.
      const tenantFilter = !req.user?.tenantId
        ? { $or: [{ tenantId: null }, { tenantId: "" }] }
        : { tenantId: req.user.tenantId };

      const allDocs = await DailyUpload.find(tenantFilter)
        .sort({ createdAt: -1 })
        .select("-__v")
        .lean();

      const scoped = [];

      for (const doc of allDocs) {
        const filePath = path.join(EXCEL_DIR, doc.filePath);
        if (!fs.existsSync(filePath)) continue; // skip missing files silently

        try {
          const { vendorRowCount } = parseAndFilterExcel(filePath, vendors);
          if (vendorRowCount === 0) continue; // no rows for this vendor in this upload
          scoped.push({
            ...doc,
            totalRows:    vendorRowCount, // replace with vendor-specific count
            importedRows: vendorRowCount,
          });
        } catch {
          // If a file can't be parsed, skip it rather than crashing the list
        }
      }

      return res.json({ uploads: scoped });
    }

    // ── SA / admin path (unchanged) ──────────────────────────────────────────
    const filter = getScopeFilter(req);
    const docs   = await DailyUpload.find(filter)
      .sort({ createdAt: -1 })
      .select("-__v")
      .lean();

    return res.json({ uploads: docs });
  } catch (err) {
    console.error("listDailyUploads error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── GET /api/daily-uploads/:id/download ─────────────────────────────────────
// Streams the saved .xlsx back with auth + scope check.
// SA: full original file (unchanged).
// Internal team member: vendor-filtered, Client-Name-stripped workbook.
export async function downloadDailyUpload(req, res) {
  try {
    const doc = await DailyUpload.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Upload not found" });

    const role     = String(req.user?.role || "").toLowerCase();
    const filePath = path.join(EXCEL_DIR, doc.filePath);

    // ── Team member path (SA internal team + company team, vendor-allocated) ──
    if (String(req.user?.role || "").toLowerCase() === "team") {
      const vendors = await getTeamMemberVendors(req);

      if (vendors.length === 0) {
        return res.status(403).json({ error: "No vendor allocated to your account" });
      }

      // Tenant scope check — team member must not access another tenant's file.
      const hasNoTenant = !req.user?.tenantId;
      const docIsOwned  = hasNoTenant
        ? (!doc.tenantId || doc.tenantId === "")
        : String(doc.tenantId || "") === String(req.user.tenantId || "");
      if (!docIsOwned) return res.status(403).json({ error: "Not allowed" });

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found on disk" });
      }

      const { filteredBuf, vendorRowCount } = parseAndFilterExcel(filePath, vendors);

      if (vendorRowCount === 0) {
        return res.status(404).json({ error: "No rows for your allocated vendor in this upload" });
      }

      // Use original filename with a _vendor suffix so the team member knows it's filtered
      const origExt  = path.extname(doc.originalFilename) || ".xlsx";
      const origBase = path.basename(doc.originalFilename, origExt);
      const dlName   = `${origBase}_vendor${origExt}`;

      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(dlName)}`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Length", filteredBuf.length);
      return res.end(filteredBuf);
    }

    // ── Scope check for SA and admin ─────────────────────────────────────────
    if (role === "superadmin") {
      // SA can only download their own uploads (tenantId null or empty).
      if (doc.tenantId && doc.tenantId !== "") {
        return res.status(403).json({ error: "Not allowed" });
      }
    } else {
      if (String(doc.tenantId || "") !== String(req.user?.tenantId || "")) {
        return res.status(403).json({ error: "Not allowed" });
      }
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on disk" });
    }

    const ext  = path.extname(doc.originalFilename).toLowerCase();
    const mime = ext === ".xls"
      ? "application/vnd.ms-excel"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalFilename)}`);
    res.setHeader("Content-Type", mime);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("downloadDailyUpload error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── DELETE /api/daily-uploads/:id ────────────────────────────────────────────
// Removes the DailyUpload document and the file on disk.
// Does NOT touch any records. Scoped: SA can only delete their own (tenantId
// null/""); admin can only delete their tenant's uploads; team → 403.
export async function deleteDailyUpload(req, res) {
  try {
    const doc = await DailyUpload.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Upload not found" });

    const role = String(req.user?.role || "").toLowerCase();

    if (role === "team") {
      return res.status(403).json({ error: "Not allowed" });
    }

    if (role === "superadmin") {
      if (doc.tenantId && doc.tenantId !== "") {
        return res.status(403).json({ error: "Not allowed" });
      }
    } else {
      // admin — must match own tenant
      if (String(doc.tenantId || "") !== String(req.user?.tenantId || "")) {
        return res.status(403).json({ error: "Not allowed" });
      }
    }

    // Delete the DB document first; if that succeeds, remove the file.
    // If file removal fails we still return ok — the doc is gone and the
    // orphaned file does no harm (the list no longer shows it).
    await DailyUpload.findByIdAndDelete(req.params.id);

    const filePath = path.join(EXCEL_DIR, doc.filePath);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {
        console.error(`[dailyUpload:delete] file unlink failed for ${doc.filePath}: ${e.message}`);
      }
    }

    console.log(`[dailyUpload:delete] user=${req.user?.email} role=${role} uploadId=${doc._id} file=${doc.filePath} originalName=${doc.originalFilename}`);

    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteDailyUpload error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
