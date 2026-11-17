// bgv-backend/routes/clientContactRoutes.js

import express from "express";
import multer  from "multer";
import { protect, adminOrManagerOnly } from "../middleware/authMiddleware.js";
import {
  listClientContacts,
  createClientContact,
  updateClientContact,
  deleteClientContact,
  bulkImportClientContacts,
  lookupClientContact,
} from "../controllers/clientContactController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Specific routes BEFORE /:id to avoid conflict
router.get("/lookup",      protect, adminOrManagerOnly, lookupClientContact);
router.post("/bulk-import", protect, adminOrManagerOnly, upload.single("file"), bulkImportClientContacts);

// CRUD
router.get("/",       protect, adminOrManagerOnly, listClientContacts);
router.post("/",      protect, adminOrManagerOnly, createClientContact);
router.put("/:id",    protect, adminOrManagerOnly, updateClientContact);
router.delete("/:id", protect, adminOrManagerOnly, deleteClientContact);

export default router;
