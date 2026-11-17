// bgv-backend/routes/vendorContactRoutes.js
// All routes require auth + superAdminOrManagerOnly. Purely additive.

import express from "express";
import multer  from "multer";
import { protect, superAdminOrManagerOnly } from "../middleware/authMiddleware.js";
import {
  listVendorContacts,
  createVendorContact,
  updateVendorContact,
  deleteVendorContact,
  bulkImportVendorContacts,
  getSendLog,
  getSettings,
  saveSettings,
  triggerVendorSend,
} from "../controllers/vendorContactController.js";

const router = express.Router();

// In-memory multer for bulk Excel import (no disk write needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (ext === "xlsx" || ext === "xls") return cb(null, true);
    cb(new Error("Only .xlsx / .xls files are allowed"));
  },
});

// Settings (get/set master on/off) — must be before /:id to avoid route conflict
router.get ("/settings",     protect, superAdminOrManagerOnly, getSettings);
router.put ("/settings",     protect, superAdminOrManagerOnly, saveSettings);

// Send log
router.get ("/send-log",     protect, superAdminOrManagerOnly, getSendLog);

// Trigger (fire-and-forget from frontend)
router.post("/trigger-send", protect, superAdminOrManagerOnly, triggerVendorSend);

// Bulk Excel import
router.post("/bulk-import",  protect, superAdminOrManagerOnly, upload.single("file"), bulkImportVendorContacts);

// CRUD
router.get ("/",             protect, superAdminOrManagerOnly, listVendorContacts);
router.post("/",             protect, superAdminOrManagerOnly, createVendorContact);
router.put ("/:id",          protect, superAdminOrManagerOnly, updateVendorContact);
router.delete("/:id",        protect, superAdminOrManagerOnly, deleteVendorContact);

export default router;
