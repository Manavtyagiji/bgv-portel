// bgv-backend/models/Pricing.js
import mongoose from "mongoose";

const PricingRuleSchema = new mongoose.Schema({
  district:    { type: String, required: true, trim: true },
  state:       { type: String, default: "",    trim: true },
  rate:        { type: Number, default: null },        // vendor rate
  vendorName:  { type: String, default: "",    trim: true },
  clientPrice: { type: Number, default: null },        // client-specific price
  // Per-state client email — additive; existing rows keep working with empty values
  email:       { type: String, default: "",    trim: true, lowercase: true },
  ccList:      { type: [String], default: [] },
  // Check-wise client pricing (Super Admin + internal team only) — when set,
  // this rule is a check-type price (client + check → price), completely
  // separate from the state/district rules above. Never matched by the
  // existing state/district resolver; only consulted by the dedicated
  // check-wise lookup, which is tried BEFORE state-wise falls back to it.
  checkName:   { type: String, default: "",    trim: true },
}, { _id: false });

const PricingSchema = new mongoose.Schema({
  tenantId:   { type: String, default: null, trim: true },   // null = super-admin / global
  scopeKey:   { type: String, required: true, trim: true },  // "__GLOBAL__" or clientName
  rules:      { type: [PricingRuleSchema], default: [] },
}, {
  timestamps: true,
});

// One pricing doc per (tenantId + scopeKey) pair
PricingSchema.index({ tenantId: 1, scopeKey: 1 }, { unique: true });

export default mongoose.model("Pricing", PricingSchema);