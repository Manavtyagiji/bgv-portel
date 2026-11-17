// bgv-backend/controllers/clientContactController.js
// Admin-only. Purely additive — no existing collection is touched.
//
// Endpoints:
//   GET    /api/client-contacts              — list contacts for caller's org
//   POST   /api/client-contacts              — create / upsert one contact
//   PUT    /api/client-contacts/:id          — update one contact
//   DELETE /api/client-contacts/:id          — delete one contact
//   POST   /api/client-contacts/bulk-import  — upsert from Excel
//   GET    /api/client-contacts/lookup       — ?clientName=... (for send-modal pre-fill)

import XLSX from "xlsx";
import ClientContact from "../models/ClientContact.js";

const SUPER_ADMIN_EMAIL = "superadmin@tervies.com";

// ── Helpers ──────────────────────────────────────────────────────────────────

function normClient(v = "") {
  return String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isValidEmail(e = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
}

function parseCcField(raw = "") {
  return String(raw || "")
    .split(/[,;]+/)
    .map(s => s.trim().toLowerCase())
    .filter(isValidEmail);
}

// Resolve the ownerEmail that scopes this admin's contacts.
function getScopeOwner(req) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role === "superadmin") return SUPER_ADMIN_EMAIL;
  return String(req.user?.email || "").toLowerCase().trim();
}

// ── GET /api/client-contacts ─────────────────────────────────────────────────
export async function listClientContacts(req, res) {
  try {
    const ownerEmail = getScopeOwner(req);
    const docs = await ClientContact.find({ ownerEmail }).sort({ clientName: 1 }).lean();
    res.json({ contacts: docs });
  } catch (err) {
    console.error("listClientContacts error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/client-contacts ────────────────────────────────────────────────
export async function createClientContact(req, res) {
  try {
    const { clientName, email, ccList, isActive } = req.body || {};

    if (!clientName || !String(clientName).trim()) {
      return res.status(400).json({ error: "clientName is required" });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const ownerEmail = getScopeOwner(req);
    const normalizedClientName = normClient(clientName);
    const cleanCc = Array.isArray(ccList)
      ? ccList.map(s => String(s).trim().toLowerCase()).filter(isValidEmail)
      : parseCcField(String(ccList || ""));

    const doc = await ClientContact.findOneAndUpdate(
      { normalizedClientName, ownerEmail },
      {
        clientName:           String(clientName).trim(),
        normalizedClientName,
        email:                String(email || "").trim().toLowerCase(),
        ccList:               cleanCc,
        isActive:             isActive !== false,
        ownerEmail,
        tenantId:             req.user?.tenantId || null,
      },
      { upsert: true, new: true }
    );

    res.json({ contact: doc });
  } catch (err) {
    console.error("createClientContact error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── PUT /api/client-contacts/:id ─────────────────────────────────────────────
export async function updateClientContact(req, res) {
  try {
    const ownerEmail = getScopeOwner(req);
    const existing = await ClientContact.findOne({ _id: req.params.id, ownerEmail }).lean();
    if (!existing) return res.status(404).json({ error: "Contact not found" });

    const { clientName, email, ccList, isActive } = req.body || {};

    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const cleanCc = Array.isArray(ccList)
      ? ccList.map(s => String(s).trim().toLowerCase()).filter(isValidEmail)
      : parseCcField(String(ccList || ""));

    const update = {};
    if (clientName !== undefined) {
      update.clientName = String(clientName).trim();
      update.normalizedClientName = normClient(clientName);
    }
    if (email    !== undefined) update.email    = String(email).trim().toLowerCase();
    if (ccList   !== undefined) update.ccList   = cleanCc;
    if (isActive !== undefined) update.isActive = isActive;

    const doc = await ClientContact.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    res.json({ contact: doc });
  } catch (err) {
    console.error("updateClientContact error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── DELETE /api/client-contacts/:id ──────────────────────────────────────────
export async function deleteClientContact(req, res) {
  try {
    const ownerEmail = getScopeOwner(req);
    const doc = await ClientContact.findOneAndDelete({ _id: req.params.id, ownerEmail });
    if (!doc) return res.status(404).json({ error: "Contact not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("deleteClientContact error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/client-contacts/bulk-import ────────────────────────────────────
// Accepts .xlsx/.xls with columns: Client Name, Email, CC
// Upserts by { normalizedClientName, ownerEmail }. Returns { added, updated, skipped, errors[] }.
export async function bulkImportClientContacts(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const ownerEmail = getScopeOwner(req);
    const tenantId   = req.user?.tenantId || null;

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    let added = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const row of rows) {
      const clientName = String(
        row["Client Name"] || row["client name"] || row["ClientName"] ||
        row["Client"] || row["client"] || ""
      ).replace(/\s+/g, " ").trim();

      const email = String(
        row["Email"] || row["email"] || row["EMAIL"] || row["Email Address"] || ""
      ).trim().toLowerCase();

      const ccRaw = String(
        row["CC"] || row["cc"] || row["CC Emails"] || row["cc emails"] ||
        row["CC Email"] || row["cc email"] || ""
      );

      if (!clientName) { skipped++; continue; }
      if (email && !isValidEmail(email)) {
        errors.push(`Skipped (invalid email): ${clientName} — ${email}`);
        skipped++;
        continue;
      }

      const normalizedClientName = normClient(clientName);
      const cleanCc = parseCcField(ccRaw);
      const existing = await ClientContact.findOne({ normalizedClientName, ownerEmail });

      await ClientContact.findOneAndUpdate(
        { normalizedClientName, ownerEmail },
        { clientName, normalizedClientName, email, ccList: cleanCc, isActive: true, ownerEmail, tenantId },
        { upsert: true, new: true }
      );

      if (existing) updated++; else added++;
    }

    res.json({ ok: true, added, updated, skipped, errors });
  } catch (err) {
    console.error("bulkImportClientContacts error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/client-contacts/lookup ──────────────────────────────────────────
// Query: ?clientName=... — returns { email, ccList } for the send-modal pre-fill.
// Scoped to the caller's org. Returns 404 if not found (admin should add it first).
export async function lookupClientContact(req, res) {
  try {
    const rawName = String(req.query.clientName || "").trim();
    if (!rawName) return res.status(400).json({ error: "clientName query param required" });

    const ownerEmail = getScopeOwner(req);
    const normalizedClientName = normClient(rawName);

    const doc = await ClientContact.findOne({ normalizedClientName, ownerEmail, isActive: true }).lean();

    if (!doc) {
      return res.status(404).json({ error: `No client contact on record for "${rawName}"` });
    }

    if (!doc.email) {
      return res.status(404).json({ error: `Client "${rawName}" has no email address saved` });
    }

    res.json({ clientName: doc.clientName, email: doc.email, ccList: doc.ccList || [] });
  } catch (err) {
    console.error("lookupClientContact error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
