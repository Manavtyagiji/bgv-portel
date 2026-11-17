// bgv-backend/models/ClientContact.js
// New collection — stores client contact details (email + CC) for manual case-mail sends.
// Keyed by normalizedClientName + ownerEmail so each org's contacts are separate.
// Does NOT touch any existing collection.

import mongoose from "mongoose";

const clientContactSchema = new mongoose.Schema(
  {
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    // Lowercased, whitespace-collapsed version — used for case-insensitive lookup.
    normalizedClientName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    ccList: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Scoping — each org's contacts are separate
    ownerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    tenantId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Composite unique: same client name can exist in different orgs
clientContactSchema.index({ normalizedClientName: 1, ownerEmail: 1 }, { unique: true });
clientContactSchema.index({ ownerEmail: 1 });

export default mongoose.model("ClientContact", clientContactSchema);
