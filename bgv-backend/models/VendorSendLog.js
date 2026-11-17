// bgv-backend/models/VendorSendLog.js
// New collection — one doc per auto-email attempt.
// Read-only after creation; never modified.
// Does NOT touch any existing collection.

import mongoose from "mongoose";

const vendorSendLogSchema = new mongoose.Schema(
  {
    vendorName:    { type: String, default: "", trim: true },
    to:            { type: String, default: "", trim: true },
    cc:            { type: [String], default: [] },
    caseCount:     { type: Number, default: 0 },
    triggeredBy:   { type: String, default: "", trim: true }, // SA email
    success:       { type: Boolean, default: false },
    errorMsg:      { type: String, default: "" },
    sentAt:        { type: Date, default: Date.now },
  },
  { timestamps: false }
);

vendorSendLogSchema.index({ sentAt: -1 });
vendorSendLogSchema.index({ vendorName: 1, sentAt: -1 });

export default mongoose.model("VendorSendLog", vendorSendLogSchema);
