// bgv-backend/models/MailConfig.js

import mongoose from "mongoose";

const mailConfigSchema = new mongoose.Schema(
  {
    ownerEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    smtpHost: {
      type: String,
      default: "smtp.gmail.com",
      trim: true,
    },

    smtpPort: {
      type: Number,
      default: 465,
    },

    smtpSecure: {
      type: Boolean,
      default: true,
    },

    smtpUser: {
      type: String,
      required: true,
      trim: true,
    },

    smtpPass: {
      type: String,
      required: true,
    },

    fromName: {
      type: String,
      default: "True Verification Services",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Extra mail accounts (up to 3). The top-level fields above remain the
    // "primary" account and are never touched. Existing docs without this
    // field get accounts:[] from Mongoose — fully backward-compatible.
    accounts: [
      {
        label:      { type: String, trim: true },
        smtpHost:   { type: String, trim: true, default: "smtp.gmail.com" },
        smtpPort:   { type: Number, default: 465 },
        smtpSecure: { type: Boolean, default: true },
        smtpUser:   { type: String, required: true, trim: true },
        smtpPass:   { type: String, required: true },
        fromName:   { type: String, trim: true },
        isActive:   { type: Boolean, default: true },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("MailConfig", mailConfigSchema);