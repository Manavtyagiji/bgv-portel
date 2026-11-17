// bgv-backend/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    // "manager" and "tl" are new, super-admin-side-only roles (internal
    // staff, same isInternal/tenantId=null pattern as existing internal
    // team members) — additive, existing superadmin/admin/team meaning and
    // behavior is completely unchanged.
    role: { type: String, enum: ["superadmin", "admin", "team", "manager", "tl"], default: "team" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    tenantId: { type: String, default: null },
    subTenantId: { type: String, default: null },
    orgName: { type: String, default: "" },

    // Which access code this admin generated for their team
    adminAccessCode: { type: String, default: null },

    // For team members — which admin they belong to
    ownerAdminEmail: { type: String, default: null },
    createdByAdminEmail: { type: String, default: null },
    joinedViaAdminCode: { type: String, default: null },
    registeredAt: { type: String, default: "" },

    // For Tervies internal staff (not belonging to any company)
    isInternal: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

export default mongoose.model("User", userSchema);