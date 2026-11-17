// bgv-backend/models/PortalState.js
import mongoose from "mongoose";

const portalStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model("PortalState", portalStateSchema);
