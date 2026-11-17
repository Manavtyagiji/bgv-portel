// bgv-backend/models/VendorContact.js
// New collection — stores vendor contact details for auto-email after SA upload.
// Keyed by normalizedVendorName for case-insensitive lookup.
// Does NOT touch any existing collection.

import mongoose from "mongoose";

const vendorContactSchema = new mongoose.Schema(
  {
    vendorName: {
      type: String,
      required: true,
      trim: true,
    },
    // Lowercased, whitespace-collapsed version — used for lookup matching.
    normalizedVendorName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
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
    // ── WhatsApp seam (stored, not yet used) ─────────────────────────────────
    whatsappNumber: {
      type: String,
      default: "",
      trim: true,
    },
    // "email" | "whatsapp" | "both"  — currently only "email" is acted on
    channel: {
      type: String,
      enum: ["email", "whatsapp", "both"],
      default: "email",
    },
    // ─────────────────────────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("VendorContact", vendorContactSchema);
