// bgv-backend/routes/uploadRoutes.js

import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { protect, adminOnly, adminOrManagerOnly, superAdminOnly } from "../middleware/authMiddleware.js";

import {
  uploadExcel,
  getRecords,
  exportFullDetail,
  addRecord,
  updateRecord,
  deleteRecord,
  deleteBatch,
  getStats,
  getNameLists,
  getClosedCasesSummary,
  bulkMatchByCheckId,
  uploadReportFile,
  getReportViewUrl,
  sendCaseMail,
  sendValidationMail,
  listMailAccountsForUser,
  getReportStatusUpdates,
  convertDocToPdf,
  getSentReports,
  markReportSent,
} from "../controllers/uploadController.js";

const router = express.Router();

/* ───────────── PATH SETUP ───────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportsDir = path.join(__dirname, "..", "uploads", "reports");

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

/* ───────────── EXCEL UPLOAD ───────────── */
const excelUpload = multer({
  storage: multer.memoryStorage(),
});

/* ───────────── REPORT UPLOAD ───────────── */
// Disk storage — kept exactly as before, still used by /convert-doc-to-pdf
// below, which shells out to `libreoffice` and needs real files on disk.
const reportUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, reportsDir),

    filename: (req, file, cb) =>
      cb(
        null,
        `report_${Date.now()}${path.extname(file.originalname)}`
      ),
  }),
});

// Memory storage — used only by /report-file (the actual report PDF upload),
// so the buffer can go straight to S3 without ever touching local disk.
const reportUploadMemory = multer({ storage: multer.memoryStorage() });

/* ───────────── ROUTES ───────────── */

router.post(
  "/",
  protect,
  excelUpload.single("file"),
  uploadExcel
);

router.get("/records", protect, getRecords);
router.get("/export-full", protect, exportFullDetail);

router.get("/records/closed-summary", protect, getClosedCasesSummary);

router.post("/records", protect, addRecord);

router.patch("/records/:id", protect, updateRecord);

router.delete(
  "/records/:id",
  protect,
  adminOrManagerOnly,
  deleteRecord
);

router.delete(
  "/batch/:batchId",
  protect,
  adminOrManagerOnly,
  deleteBatch
);

router.get("/stats", protect, getStats);
router.get("/name-lists", protect, getNameLists);
router.post("/bulk-match", protect, bulkMatchByCheckId);

router.post(
  "/convert-doc-to-pdf",
  protect,
  reportUpload.single("file"),
  convertDocToPdf
);

/* ───────────── REPORT FILE UPLOAD ───────────── */

router.post(
  "/report-file",
  protect,
  reportUploadMemory.single("file"),
  uploadReportFile
);

// Resolves a viewable URL for a record's report — S3 presigned URL if
// migrated/uploaded-to-S3, else the legacy local static path. Same auth as
// upload (protect + per-record tenant/role scoping inside the controller).
router.get(
  "/report-file/:id",
  protect,
  getReportViewUrl
);



/* ───────────── REAL-TIME REPORT STATUS (delta poll) ───────────── */

router.get(
  "/report-status",
  protect,
  getReportStatusUpdates
);

/* ───────────── LIST MAIL ACCOUNTS (for sender picker) ───────────── */

router.get(
  "/mail-configs",
  protect,
  listMailAccountsForUser
);

/* ───────────── SEND MAIL WITH EXCEL + PDF ───────────── */

router.post(
  "/send-mail",
  protect,
  sendCaseMail
);

/* ───────────── COST SUMMARY VALIDATION MAIL (super-admin only) ───────────── */

router.post(
  "/send-validation-mail",
  protect,
  superAdminOnly,
  sendValidationMail
);

/* ───────────── SENT REPORTS (admin-only) ───────────── */

router.get("/sent-reports",  protect, adminOrManagerOnly, getSentReports);
router.post("/mark-sent",    protect, adminOrManagerOnly, markReportSent);

export default router;