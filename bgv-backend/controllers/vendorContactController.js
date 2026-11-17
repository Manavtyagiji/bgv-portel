// bgv-backend/controllers/vendorContactController.js
// Super-admin only. Purely additive — no existing collection is touched.
//
// Endpoints:
//   GET    /api/vendor-contacts              — list all vendor contacts
//   POST   /api/vendor-contacts              — create one vendor contact
//   PUT    /api/vendor-contacts/:id          — update one vendor contact
//   DELETE /api/vendor-contacts/:id          — soft-delete (isActive=false) or hard delete
//   POST   /api/vendor-contacts/bulk-import  — upsert from Excel (multer file)
//   GET    /api/vendor-contacts/send-log     — list recent send-log entries
//   GET    /api/vendor-contacts/settings     — get master on/off toggle
//   PUT    /api/vendor-contacts/settings     — save master on/off toggle
//   POST   /api/vendor-contacts/trigger-send — called fire-and-forget after SA upload

import path       from "path";
import { fileURLToPath } from "url";
import XLSX        from "xlsx";
import nodemailer  from "nodemailer";
import { saveToSentFolder } from "../utils/saveToSentFolder.js";
import MailConfig  from "../models/MailConfig.js";
import VendorContact from "../models/VendorContact.js";
import VendorSendLog from "../models/VendorSendLog.js";
import PortalState   from "../models/PortalState.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const SUPER_ADMIN_EMAIL   = "superadmin@tervies.com";
const SETTINGS_KEY        = "vendorAutoSend"; // PortalState key for master toggle

// ── Helpers ─────────────────────────────────────────────────────────────────

function normVendor(v = "") {
  // Strips zero-width/invisible characters (zero-width space, ZWNJ, ZWJ,
  // BOM/ZWNBSP, non-breaking space) that can survive a copy-paste into an
  // uploaded Excel cell and look visually identical to the saved vendor
  // name while silently failing an exact-string match here — same fix
  // already applied to the Daily Excel upload vendor-name check.
  return String(v || "")
    .replace(/[\u200b-\u200d\ufeff\xa0]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isValidEmail(e = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
}

// Parse a CC field that may contain comma/semicolon-separated emails.
// Returns only valid emails; silently drops invalid ones.
function parseCcField(raw = "") {
  return String(raw || "")
    .split(/[,;]+/)
    .map(s => s.trim().toLowerCase())
    .filter(isValidEmail);
}

// Reuse the EXACT same transporter logic as uploadController.js.
// We duplicate only what's needed here to avoid cross-import coupling.
async function getSATransporter() {
  const configDoc = await MailConfig.findOne({ ownerEmail: SUPER_ADMIN_EMAIL }).lean();
  if (!configDoc) throw new Error("Super admin mail config not found");

  const cfg = configDoc;
  if (!cfg.smtpUser || !cfg.smtpPass) throw new Error("SMTP credentials missing in mail config");

  const from = cfg.fromName
    ? `"${cfg.fromName}" <${cfg.smtpUser}>`
    : cfg.smtpUser;

  const transporter = nodemailer.createTransport({
    host:   cfg.smtpHost   || "smtp.gmail.com",
    port:   Number(cfg.smtpPort || 465),
    secure: cfg.smtpSecure !== false,
    auth:   { user: cfg.smtpUser, pass: cfg.smtpPass },
  });

  return {
    transporter,
    from,
    account: { smtpHost: cfg.smtpHost, smtpUser: cfg.smtpUser, smtpPass: cfg.smtpPass },
  };
}

// Extract vendor name from a saved-row object (mirrors getExcelVendorNameFromRow in frontend).
function getVendorFromRow(row = {}) {
  const r = row.rawData || row;
  const VENDOR_KEYS = ["Vendor Name", "vendor name", "VendorName", "Vendor Company", "vendor company", "Vendor", "vendor"];
  for (const k of VENDOR_KEYS) {
    const v = r[k] || row[k];
    if (v && String(v).trim()) return String(v).replace(/\s+/g, " ").trim();
  }
  return "";
}

// Excel stores a plain JS Number as a numeric cell — for phone numbers that
// risks scientific notation and silently drops leading zeros. Forcing to a
// string keeps json_to_sheet emitting a text cell instead.
function asPhoneText(v) {
  if (v === undefined || v === null || v === "") return "";
  return String(v).trim();
}

// Build an Excel buffer listing the cases for one vendor (no Client Name).
function buildCasesExcel(vendorName, cases) {
  const rows = cases.map((c, i) => {
    const r = c.rawData || c;
    return {
      "S.No":           i + 1,
      "Company Name":   r["Company Name"] || r["company name"] || r["COMPANY NAME"] || c.companyName || "",
      "Candidate Name": r["Candidate Name"] || c.candidateName || "",
      "Candidate Father Name": r["Candidate Father Name"] || c.candidateFatherName || "",
      "Check Name":     r["Check Name"]     || c.checkName     || "",
      "Case ID":        r["Case ID"]        || r["Check Id"]   || "",
      "City":           r["City"]           || c.city          || "",
      "State":          r["State"]          || c.state         || "",
      "Full Address":   r["Address"]   || r["address"]   || r["Full Address"]   || c.fullAddress   || "",
      "Pincode":        r["Pincode"]   || r["pincode"]    || r["Pin Code"]  || r["PIN"] || c.pincode || "",
      "Phone Number":     asPhoneText(r["Candidate Phone Number"] || c.candidatePhoneNumber || ""),
      "Alternate Number": asPhoneText(r["Candidate Alternative number"] || r["Candidate Alternative Number"] || c.candidateAlternativeNumber || ""),
      "Assigned Date":  r["Assign Date"]    || r["Assigned Date"] || c.assignDate || "",
      "Status":         r["Status"]         || c.status        || "Pending",
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Cases");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// ── GET /api/vendor-contacts ─────────────────────────────────────────────────
export async function listVendorContacts(req, res) {
  try {
    const docs = await VendorContact.find().sort({ vendorName: 1 }).lean();
    res.json({ contacts: docs });
  } catch (err) {
    console.error("listVendorContacts error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/vendor-contacts ────────────────────────────────────────────────
export async function createVendorContact(req, res) {
  try {
    const { vendorName, email, ccList, whatsappNumber, channel, isActive } = req.body || {};

    if (!vendorName || !String(vendorName).trim()) {
      return res.status(400).json({ error: "vendorName is required" });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const normalizedVendorName = normVendor(vendorName);
    const cleanCc = Array.isArray(ccList)
      ? ccList.map(s => String(s).trim().toLowerCase()).filter(isValidEmail)
      : parseCcField(String(ccList || ""));

    const doc = await VendorContact.findOneAndUpdate(
      { normalizedVendorName },
      {
        vendorName:           String(vendorName).trim(),
        normalizedVendorName,
        email:                String(email || "").trim().toLowerCase(),
        ccList:               cleanCc,
        whatsappNumber:       String(whatsappNumber || "").trim(),
        channel:              channel || "email",
        isActive:             isActive !== false,
      },
      { upsert: true, new: true }
    );

    res.json({ contact: doc });
  } catch (err) {
    console.error("createVendorContact error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── PUT /api/vendor-contacts/:id ─────────────────────────────────────────────
export async function updateVendorContact(req, res) {
  try {
    const { vendorName, email, ccList, whatsappNumber, channel, isActive } = req.body || {};

    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const cleanCc = Array.isArray(ccList)
      ? ccList.map(s => String(s).trim().toLowerCase()).filter(isValidEmail)
      : parseCcField(String(ccList || ""));

    const update = {};
    if (vendorName !== undefined)    { update.vendorName = String(vendorName).trim(); update.normalizedVendorName = normVendor(vendorName); }
    if (email     !== undefined)     update.email          = String(email).trim().toLowerCase();
    if (ccList    !== undefined)     update.ccList         = cleanCc;
    if (whatsappNumber !== undefined) update.whatsappNumber = String(whatsappNumber).trim();
    if (channel   !== undefined)     update.channel        = channel;
    if (isActive  !== undefined)     update.isActive       = isActive;

    const doc = await VendorContact.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!doc) return res.status(404).json({ error: "Vendor contact not found" });

    res.json({ contact: doc });
  } catch (err) {
    console.error("updateVendorContact error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── DELETE /api/vendor-contacts/:id ──────────────────────────────────────────
export async function deleteVendorContact(req, res) {
  try {
    const doc = await VendorContact.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Vendor contact not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("deleteVendorContact error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/vendor-contacts/bulk-import ────────────────────────────────────
// Accepts an .xlsx / .xls file with columns: Vendor Name, Email, CC
// Upserts by normalizedVendorName. Returns { added, updated, skipped, errors[] }.
export async function bulkImportVendorContacts(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    let added = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const row of rows) {
      // Flexible column name matching
      const vendorName = String(
        row["Vendor Name"] || row["vendor name"] || row["VendorName"] ||
        row["Vendor"] || row["vendor"] || ""
      ).replace(/\s+/g, " ").trim();

      const email = String(
        row["Email"] || row["email"] || row["EMAIL"] || row["Email Address"] || ""
      ).trim().toLowerCase();

      const ccRaw = String(
        row["CC"] || row["cc"] || row["CC Emails"] || row["cc emails"] ||
        row["CC Email"] || row["cc email"] || ""
      );

      if (!vendorName) { skipped++; continue; }
      if (email && !isValidEmail(email)) {
        errors.push(`Row skipped (invalid email): ${vendorName} — ${email}`);
        skipped++;
        continue;
      }

      const normalizedVendorName = normVendor(vendorName);
      const cleanCc = parseCcField(ccRaw);

      const existing = await VendorContact.findOne({ normalizedVendorName });

      await VendorContact.findOneAndUpdate(
        { normalizedVendorName },
        {
          vendorName,
          normalizedVendorName,
          email,
          ccList:        cleanCc,
          isActive:      true,
        },
        { upsert: true, new: true }
      );

      if (existing) updated++; else added++;
    }

    res.json({ ok: true, added, updated, skipped, errors });
  } catch (err) {
    console.error("bulkImportVendorContacts error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/vendor-contacts/send-log ────────────────────────────────────────
export async function getSendLog(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit || 200), 500);
    const logs = await VendorSendLog.find()
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();
    res.json({ logs });
  } catch (err) {
    console.error("getSendLog error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/vendor-contacts/settings ────────────────────────────────────────
export async function getSettings(req, res) {
  try {
    const doc = await PortalState.findOne({ key: SETTINGS_KEY }).lean();
    const enabled = doc?.value?.enabled === true; // default OFF
    res.json({ enabled });
  } catch (err) {
    console.error("getSettings error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── PUT /api/vendor-contacts/settings ────────────────────────────────────────
export async function saveSettings(req, res) {
  try {
    const enabled = req.body?.enabled === true;
    await PortalState.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { $set: { value: { enabled }, updatedBy: req.user?.email || "superadmin" } },
      { upsert: true }
    );
    res.json({ ok: true, enabled });
  } catch (err) {
    console.error("saveSettings error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/vendor-contacts/trigger-send ───────────────────────────────────
// Called fire-and-forget from the frontend after a super-admin Daily Excel upload.
// Body: { cases: [ ...savedRows ] }
// - Checks master on/off toggle first.
// - Groups cases by vendor name.
// - For each vendor, finds active VendorContact with a valid email.
// - Sends one email per vendor via SA's existing mail config.
// - Logs every attempt to VendorSendLog.
// - One vendor failure never blocks others or the upload response.
export async function triggerVendorSend(req, res) {
  // Respond immediately — sending happens async after response.
  res.json({ ok: true, message: "Vendor send triggered" });

  // ── Gate: master on/off ──────────────────────────────────────────────────
  try {
    const settingsDoc = await PortalState.findOne({ key: SETTINGS_KEY }).lean();
    if (settingsDoc?.value?.enabled !== true) return; // silently skip when OFF
  } catch { return; }

  const cases = Array.isArray(req.body?.cases) ? req.body.cases : [];
  if (cases.length === 0) return;

  // ── Group cases by vendor (normalised) ──────────────────────────────────
  const byVendor = new Map(); // normKey → { vendorName, cases[] }
  for (const c of cases) {
    const rawVendor = getVendorFromRow(c);
    if (!rawVendor) continue;
    const nk = normVendor(rawVendor);
    if (!byVendor.has(nk)) byVendor.set(nk, { vendorName: rawVendor, cases: [] });
    byVendor.get(nk).cases.push(c);
  }

  if (byVendor.size === 0) return;

  // ── Get SA transporter once ──────────────────────────────────────────────
  let mailer;
  try {
    mailer = await getSATransporter();
  } catch (err) {
    console.error("[vendorSend] Could not create transporter:", err.message);
    // Log a generic failure for all vendors
    for (const { vendorName, cases: vc } of byVendor.values()) {
      await VendorSendLog.create({
        vendorName, to: "", cc: [], caseCount: vc.length,
        triggeredBy: req.user?.email || SUPER_ADMIN_EMAIL,
        success: false, errorMsg: `Transporter setup failed: ${err.message}`,
        sentAt: new Date(),
      }).catch(() => {});
    }
    return;
  }

  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // ── Send one email per vendor ────────────────────────────────────────────
  for (const [nk, { vendorName, cases: vc }] of byVendor) {
    // Look up saved vendor contact
    const contact = await VendorContact.findOne({ normalizedVendorName: nk }).lean();

    if (!contact || !contact.isActive || !contact.email || !isValidEmail(contact.email)) {
      // Skip silently — no saved email; log as skipped
      await VendorSendLog.create({
        vendorName, to: contact?.email || "", cc: [],
        caseCount: vc.length,
        triggeredBy: req.user?.email || SUPER_ADMIN_EMAIL,
        success: false,
        errorMsg: !contact ? "No vendor contact found" :
                  !contact.isActive ? "Vendor contact inactive" :
                  "No valid email on record",
        sentAt: new Date(),
      }).catch(() => {});
      continue;
    }

    // ── WhatsApp channel (seam — not implemented) ──────────────────────────
    // if (contact.channel === "whatsapp" || contact.channel === "both") {
    //   // TODO: integrate Twilio / Meta Cloud API using contact.whatsappNumber
    //   // Do NOT add any WhatsApp library until this seam is activated.
    // }
    // ──────────────────────────────────────────────────────────────────────

    // Build case Excel attachment (no Client Name column)
    const excelBuf = buildCasesExcel(vendorName, vc);

    const validCc = (contact.ccList || []).filter(isValidEmail);
    const subject = `BGV Cases Allocated — ${vendorName} — ${today}`;
    const text    = `Dear ${vendorName} Team,\n\nPlease find attached the cases allocated to you on ${today}.\nTotal cases: ${vc.length}\n\nRegards,\nTrue Verification Services`;

    let success = false;
    let errorMsg = "";

    try {
      const vendorMailOptions = {
        from:    mailer.from,
        to:      contact.email,
        cc:      validCc.length ? validCc.join(", ") : undefined,
        subject,
        text,
        attachments: [{
          filename:    `BGV_Cases_${vendorName.replace(/\s+/g, "_")}_${today.replace(/\s+/g, "_")}.xlsx`,
          content:     excelBuf,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }],
      };
      await mailer.transporter.sendMail(vendorMailOptions);
      // Non-blocking: copy to SA's IMAP Sent folder (best-effort, never blocks)
      saveToSentFolder(mailer.account, vendorMailOptions).catch(() => {});
      success = true;
      console.log(`[vendorSend] ✅ Sent to ${contact.email} for vendor "${vendorName}" (${vc.length} cases)`);
    } catch (err) {
      errorMsg = err.message;
      console.error(`[vendorSend] ❌ Failed for vendor "${vendorName}":`, err.message);
    }

    await VendorSendLog.create({
      vendorName,
      to:          contact.email,
      cc:          validCc,
      caseCount:   vc.length,
      triggeredBy: req.user?.email || SUPER_ADMIN_EMAIL,
      success,
      errorMsg,
      sentAt:      new Date(),
    }).catch(() => {});
  }
}
