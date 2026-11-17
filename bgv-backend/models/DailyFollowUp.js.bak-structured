// bgv-backend/models/DailyFollowUp.js
// Super Admin's internal team only (Super Admin, Manager, TL, internal Team
// members) — a daily follow-up log each person keeps on their own cases.
// Entirely separate collection/feature; touches no existing model or route.
import mongoose from "mongoose";

const dailyFollowUpSchema = new mongoose.Schema(
  {
    addedByEmail: { type: String, required: true, trim: true, lowercase: true, index: true },
    addedByName:  { type: String, default: "", trim: true },

    date:              { type: Date,   required: true },
    checkId:           { type: String, default: "", trim: true },
    candidateName:     { type: String, default: "", trim: true },
    clientName:        { type: String, default: "", trim: true },
    remark:            { type: String, default: "", trim: true },
    status:            { type: String, default: "Pending", trim: true },
    nextFollowUpDate:  { type: Date,   default: null },
  },
  { timestamps: true }
);

dailyFollowUpSchema.index({ addedByEmail: 1, date: -1 });

export default mongoose.model("DailyFollowUp", dailyFollowUpSchema);
