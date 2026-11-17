// bgv-backend/models/StatusAudit.js
// Append-only audit log of every record status change.
// Entries are deleted by the auditCleanup cron after 3 months.

import mongoose from "mongoose";

const StatusAuditSchema = new mongoose.Schema(
  {
    recordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Record",
      index: true,
    },
    clientName:    { type: String, default: "" },
    candidateName: { type: String, default: "" },
    checkId:       { type: String, default: "" },
    oldStatus:     { type: String, default: "" },
    newStatus:     { type: String, default: "" },

    // Server-assigned from req.user — never trusted from the browser
    changedByEmail: { type: String, default: "" },
    changedByRole:  { type: String, default: "" },

    // Record's tenantId (used for scope-filtering on reads)
    tenantId: { type: String, default: null, index: true },

    ownerAdminEmail: { type: String, default: "" },

    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

export default mongoose.model("StatusAudit", StatusAuditSchema);
