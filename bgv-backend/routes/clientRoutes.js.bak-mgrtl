import express from "express";
import {
  createClient,
  getClients,
  getTenantCodes,
  createTenantCode,
  getTenants,
  saveTenant,
  getAllocations,
  saveAllocation,
} from "../controllers/clientController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createClient);
router.get("/", protect, getClients);

router.get("/tenant-codes", protect, getTenantCodes);
router.post("/tenant-codes", protect, createTenantCode);

router.get("/tenants", protect, getTenants);
router.post("/tenants", protect, saveTenant);

router.get("/allocations", protect, getAllocations);
router.post("/allocations", protect, saveAllocation);

export default router;