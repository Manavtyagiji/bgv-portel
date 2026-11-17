// bgv-backend/routes/dailyFollowUpRoutes.js
// Daily Follow-Up — Super Admin's internal team only. Every route requires
// auth; role/ownership scoping happens inside the controller (never
// client-supplied), same pattern as inboxRoutes.js.
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getMySheet,
  saveMySheet,
  listSheets,
  getMemberSheet,
} from "../controllers/dailyFollowUpController.js";

const router = express.Router();

router.get("/sheet", protect, getMySheet);
router.put("/sheet", protect, saveMySheet);
router.get("/sheets", protect, listSheets);
router.get("/sheets/:email", protect, getMemberSheet);

export default router;
