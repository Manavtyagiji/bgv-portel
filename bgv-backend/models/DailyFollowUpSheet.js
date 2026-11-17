// bgv-backend/models/DailyFollowUpSheet.js
// Super Admin's internal team only. One document per person — a fully
// free-form spreadsheet they define themselves (their own column layout,
// their own rows), not a fixed schema. Replaces the earlier structured
// DailyFollowUp model (that collection is left in place, unused, rather
// than deleted — no real entries existed in it yet).
import mongoose from "mongoose";

const columnSchema = new mongoose.Schema(
  { id: { type: String, required: true }, label: { type: String, default: "" } },
  { _id: false }
);

const rowSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    cells: { type: mongoose.Schema.Types.Mixed, default: {} }, // { [columnId]: value }
  },
  { _id: false }
);

const dailyFollowUpSheetSchema = new mongoose.Schema(
  {
    ownerEmail: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    ownerName:  { type: String, default: "", trim: true },
    columns:    { type: [columnSchema], default: [] },
    rows:       { type: [rowSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("DailyFollowUpSheet", dailyFollowUpSheetSchema);
