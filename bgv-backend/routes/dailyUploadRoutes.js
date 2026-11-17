// bgv-backend/routes/dailyUploadRoutes.js

import express from "express";
import multer  from "multer";
import path    from "path";
import fs      from "fs";
import { fileURLToPath } from "url";

import { protect } from "../middleware/authMiddleware.js";
import {
  saveDailyExcel,
  listDailyUploads,
  downloadDailyUpload,
  deleteDailyUpload,
} from "../controllers/dailyUploadController.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* Ensure storage folder exists at startup */
const EXCEL_DIR = path.join(__dirname, "..", "uploads-excel");
if (!fs.existsSync(EXCEL_DIR)) fs.mkdirSync(EXCEL_DIR, { recursive: true });

/* Multer — diskStorage, timestamp-prefixed filenames */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, EXCEL_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".xlsx";
    cb(null, `daily_${Date.now()}${ext}`);
  },
});

const excelUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },   // 50 MB cap
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") return cb(null, true);
    cb(new Error("Only .xlsx / .xls files are allowed"));
  },
});

/* ── Routes ── */
router.post("/",                 protect, excelUpload.single("file"), saveDailyExcel);
router.get("/",                  protect, listDailyUploads);
router.get("/:id/download",      protect, downloadDailyUpload);
router.delete("/:id",            protect, deleteDailyUpload);

export default router;
