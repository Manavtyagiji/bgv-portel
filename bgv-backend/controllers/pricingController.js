// bgv-backend/controllers/pricingController.js
import Pricing from "../models/Pricing.js";
import XLSX from "xlsx";

const SUPER_ADMIN_EMAIL = "superadmin@tervies.com";

function getPricingTenantId(user = {}) {
  if (user.role === "superadmin") return "__SUPERADMIN__";

  // SA internal team members access the SA's pricing store.
  // Three ways a team member belongs to SA:
  //   1. explicitly flagged isInternal=true
  //   2. ownerAdminEmail points at the SA account
  //   3. registered without an accessCode → no tenantId, no ownerAdminEmail
  const ownerEmail = String(user.ownerAdminEmail || user.adminEmail || "").trim().toLowerCase();
  const noTenant   = !user.tenantId && !user.ownerAdminEmail;
  if (user.isInternal === true || ownerEmail === SUPER_ADMIN_EMAIL || noTenant) {
    return "__SUPERADMIN__";
  }

  return String(
    user.tenantId ||
    user.companyTenantId ||
    user.companyId ||
    user.tenantCode ||
    user.orgName ||
    user.ownerAdminEmail ||
    user.email ||
    "__UNKNOWN_TENANT__"
  )
    .trim()
    .toLowerCase();
}

/* ── GET /api/pricing ── */
export async function getPricing(req, res) {
  try {
    const tenantId = getPricingTenantId(req.user);

    const docs = await Pricing.find({ tenantId }).lean();

    const result = {};
    docs.forEach((d) => {
      result[d.scopeKey] = d.rules;
    });

    res.json(result);
  } catch (err) {
    console.error("getPricing error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ── PUT /api/pricing ── */
export async function savePricing(req, res) {
  try {
    const tenantId = getPricingTenantId(req.user);
    const { pricingRules } = req.body;

    if (!pricingRules || typeof pricingRules !== "object") {
      return res.status(400).json({ error: "pricingRules object required" });
    }

    const ops = Object.entries(pricingRules).map(([scopeKey, rules]) =>
      Pricing.findOneAndUpdate(
        { tenantId, scopeKey },
        { $set: { rules: Array.isArray(rules) ? rules : [] } },
        { upsert: true, new: true }
      )
    );

    await Promise.all(ops);

    const keysToKeep = Object.keys(pricingRules);
    if (keysToKeep.length > 0) {
      await Pricing.deleteMany({
        tenantId,
        scopeKey: { $nin: keysToKeep },
      });
    }

    res.json({ ok: true, tenantId, saved: keysToKeep.length });
  } catch (err) {
    console.error("savePricing error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ── PATCH /api/pricing/:scopeKey ── */
export async function saveScopePricing(req, res) {
  try {
    const tenantId = getPricingTenantId(req.user);
    const scopeKey = decodeURIComponent(req.params.scopeKey);
    const { rules } = req.body;

    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: "rules array required" });
    }

    const doc = await Pricing.findOneAndUpdate(
      { tenantId, scopeKey },
      { $set: { rules } },
      { upsert: true, new: true }
    );

    res.json({ ok: true, tenantId, scopeKey, count: doc.rules.length });
  } catch (err) {
    console.error("saveScopePricing error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ── DELETE /api/pricing/:scopeKey ── */
export async function deleteScopePricing(req, res) {
  try {
    const tenantId = getPricingTenantId(req.user);
    const scopeKey = decodeURIComponent(req.params.scopeKey);

    await Pricing.deleteOne({ tenantId, scopeKey });
    res.json({ ok: true, tenantId, deleted: scopeKey });
  } catch (err) {
    console.error("deleteScopePricing error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ── POST /api/pricing/bulk-import-contacts ──────────────────────────────────
 * Excel columns: Client Name | Email | CC | State
 * Rules:
 *   - Match by clientName (case-insensitive) → find Pricing doc (scopeKey)
 *   - Match by state (case-insensitive) → find the clientPrice rule
 *   - If match found → update email + ccList ONLY; clientPrice is NEVER touched
 *   - If no match → SKIP; never create a new row
 *   - Returns { updated, skipped, errors[] }
 * ─────────────────────────────────────────────────────────────────────────── */
function normKey(v) {
  return String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
}
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
}
function parseCc(raw) {
  return String(raw || "")
    .split(/[,;]+/)
    .map(s => s.trim().toLowerCase())
    .filter(isValidEmail);
}

export async function bulkImportContactsToPricing(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const tenantId = getPricingTenantId(req.user);

    // Load all Pricing docs for this tenant once
    const allDocs = await Pricing.find({ tenantId });

    // Build a case-insensitive index: normKey(scopeKey) → Pricing doc
    const docIndex = {};
    for (const doc of allDocs) {
      docIndex[normKey(doc.scopeKey)] = doc;
    }

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    let updated = 0, skipped = 0;
    const errors = [];
    // Batch updates: scopeKey → updated rules array
    const pending = {};

    for (const row of rows) {
      const clientName = String(
        row["Client Name"] || row["client name"] || row["ClientName"] || row["Client"] || ""
      ).replace(/\s+/g, " ").trim();

      const email = String(
        row["Email"] || row["email"] || row["EMAIL"] || row["Email Address"] || ""
      ).trim().toLowerCase();

      const ccRaw = String(
        row["CC"] || row["cc"] || row["CC Emails"] || row["CC Email"] || ""
      );

      const stateName = String(
        row["State"] || row["state"] || row["STATE"] || row["Location State"] || ""
      ).replace(/\s+/g, " ").trim();

      if (!clientName) { skipped++; continue; }
      if (!stateName)  { skipped++; errors.push(`Skipped (no State): "${clientName}" — State column is empty`); continue; }
      if (email && !isValidEmail(email)) {
        skipped++;
        errors.push(`Skipped (invalid email): "${clientName}" / ${stateName} — ${email}`);
        continue;
      }

      const normClient = normKey(clientName);
      const normState  = normKey(stateName);

      const doc = docIndex[normClient];
      if (!doc) {
        skipped++;
        errors.push(`Skipped (client not found): "${clientName}" — add per-state rows in Add Clients first`);
        continue;
      }

      // Work on in-memory pending copy so we can batch saves
      if (!pending[doc.scopeKey]) {
        pending[doc.scopeKey] = doc.rules.map(r => ({ ...r.toObject ? r.toObject() : r }));
      }
      const rules = pending[doc.scopeKey];

      const ruleIdx = rules.findIndex(
        r => r.clientPrice !== undefined &&
             normKey(r.state) === normState
      );
      if (ruleIdx === -1) {
        skipped++;
        errors.push(`Skipped (state not found): "${clientName}" / "${stateName}" — add this state row in Add Clients first`);
        continue;
      }

      const cleanCc = parseCc(ccRaw);
      rules[ruleIdx] = {
        ...rules[ruleIdx],
        email:  email || rules[ruleIdx].email || "",
        ccList: cleanCc,
      };
      updated++;
    }

    // Flush pending updates
    await Promise.all(
      Object.entries(pending).map(([scopeKey, rules]) =>
        Pricing.findOneAndUpdate(
          { tenantId, scopeKey },
          { $set: { rules } },
          { new: true }
        )
      )
    );

    res.json({ ok: true, updated, skipped, errors });
  } catch (err) {
    console.error("bulkImportContactsToPricing error:", err.message);
    res.status(500).json({ error: err.message });
  }
}