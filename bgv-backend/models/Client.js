import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    type: { type: String, default: "client" },

    name: String,

    // TAC
    code: String,
    label: String,
    used: { type: Boolean, default: false },
    usedBy: String,
    usedAt: Date,

    // tenant
    tenantId: String,
    adminEmail: String,
    adminAccessCode: String,
    accessCodeUsed: String,

    // allocation
    memberEmail: String,
    clients: [String],
  },
  { timestamps: true }
);

export default mongoose.model("Client", schema);