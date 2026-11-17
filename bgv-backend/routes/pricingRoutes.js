// bgv-backend/routes/pricingRoutes.js
import express from "express";
import multer  from "multer";
import { protect, adminOrManagerOnly } from "../middleware/authMiddleware.js";
import {
  getPricing,
  savePricing,
  saveScopePricing,
  deleteScopePricing,
  bulkImportContactsToPricing,
} from "../controllers/pricingController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── Fetch all pricing rules for the calling user's tenant ─────────
router.get(  "/",          protect, getPricing);

// ── Bulk-import email+CC into per-state client rows (update-only) ─
// BEFORE /:scopeKey to avoid route collision
router.post("/bulk-import-contacts", protect, adminOrManagerOnly, upload.single("file"), bulkImportContactsToPricing);

// ── Replace ALL pricing rules (bulk save) ─────────────────────────
router.put(  "/",          protect, adminOrManagerOnly, savePricing);

// ── Upsert rules for a SINGLE scope key (lightweight update) ──────
router.patch("/:scopeKey", protect, adminOrManagerOnly, saveScopePricing);

// ── Delete a scope key's rules ────────────────────────────────────
router.delete("/:scopeKey",protect, adminOrManagerOnly, deleteScopePricing);

export default router;