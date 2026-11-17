// bgv-backend/controllers/dailyFollowUpController.js
// Daily Follow-Up — Super Admin's internal team only. Each person owns one
// fully free-form sheet (their own columns, their own rows) — Super
// Admin/Manager can view (read-only) any team member's sheet and always
// have full read/write on their own; TL/Team only ever see and edit their
// own. Every check below is server-side and independent of whatever the
// frontend hides, per the app's existing dual-layer pattern.
import DailyFollowUpSheet from "../models/DailyFollowUpSheet.js";

function isInternalStaff(user) {
  const role = String(user?.role || "").toLowerCase();
  if (role === "superadmin" || role === "manager" || role === "tl") return true;
  if (role === "team") {
    const tenantId = user?.tenantId || null;
    const ownerAdminEmail = user?.ownerAdminEmail
      ? String(user.ownerAdminEmail).trim().toLowerCase()
      : null;
    return user?.isInternal === true || (!tenantId && !ownerAdminEmail);
  }
  return false;
}

function canViewEveryone(user) {
  const role = String(user?.role || "").toLowerCase();
  return role === "superadmin" || role === "manager";
}

const DEFAULT_COLUMNS = [
  { id: "col_date",   label: "Date" },
  { id: "col_case",   label: "Case ID" },
  { id: "col_remark", label: "Remark" },
  { id: "col_status", label: "Status" },
];

// GET /api/daily-followups/sheet — the CALLER's own sheet, creating an
// empty default one on first visit.
export async function getMySheet(req, res) {
  try {
    if (!isInternalStaff(req.user)) {
      return res.status(403).json({ error: "Not available for your account" });
    }
    const ownerEmail = String(req.user?.email || "").trim().toLowerCase();

    let sheet = await DailyFollowUpSheet.findOne({ ownerEmail }).lean();
    if (!sheet) {
      const created = await DailyFollowUpSheet.create({
        ownerEmail,
        ownerName: req.user?.name || ownerEmail,
        columns: DEFAULT_COLUMNS,
        rows: [],
      });
      sheet = created.toObject();
    }
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/daily-followups/sheet — replaces the CALLER's own columns+rows
// wholesale (one person editing their own sheet at a time; no need for
// granular per-cell patching).
export async function saveMySheet(req, res) {
  try {
    if (!isInternalStaff(req.user)) {
      return res.status(403).json({ error: "Not available for your account" });
    }
    const ownerEmail = String(req.user?.email || "").trim().toLowerCase();
    const { columns, rows } = req.body || {};
    if (!Array.isArray(columns) || !Array.isArray(rows)) {
      return res.status(400).json({ error: "columns[] and rows[] are required" });
    }

    const updated = await DailyFollowUpSheet.findOneAndUpdate(
      { ownerEmail },
      {
        $set: {
          columns,
          rows,
          ownerName: req.user?.name || ownerEmail,
        },
      },
      { new: true, upsert: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/daily-followups/sheets — Super Admin/Manager only. Every team
// member's sheet, summarized (for a picker), sorted by most recently
// updated.
export async function listSheets(req, res) {
  try {
    if (!canViewEveryone(req.user)) {
      return res.json([]);
    }
    const sheets = await DailyFollowUpSheet.find({})
      .select("ownerEmail ownerName rows updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    res.json(sheets.map(s => ({
      ownerEmail: s.ownerEmail,
      ownerName: s.ownerName || s.ownerEmail,
      rowCount: Array.isArray(s.rows) ? s.rows.length : 0,
      updatedAt: s.updatedAt,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/daily-followups/sheets/:email — Super Admin/Manager only,
// read-only view of one team member's sheet (their own sheet's edit rights
// go through getMySheet/saveMySheet above instead, even for SA/Manager).
export async function getMemberSheet(req, res) {
  try {
    if (!canViewEveryone(req.user)) {
      return res.status(403).json({ error: "Not available for your account" });
    }
    const email = String(req.params.email || "").trim().toLowerCase();
    const sheet = await DailyFollowUpSheet.findOne({ ownerEmail: email }).lean();
    if (!sheet) return res.status(404).json({ error: "No sheet found for this team member yet" });
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
