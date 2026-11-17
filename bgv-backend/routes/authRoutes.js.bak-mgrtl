// bgv-backend/routes/authRoutes.js
import express from "express";
import {
  register,
  login,
  getMe,
  getAllUsers,
  updateUser,
  resetUserPassword,
  syncLocalUser,
  syncUsers,
  getAllUsersSynced,
  getPortalState,
  savePortalState,
  patchPortalState,
} from "../controllers/authController.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/sync", syncLocalUser); // No protect — has its own auth logic

router.get("/me", protect, getMe);
router.get("/users", protect, adminOnly, getAllUsers);
router.patch("/users/:id", protect, adminOnly, updateUser);

/* Server sync routes for data that was previously browser-local only. */
router.get("/all-users", protect, adminOnly, getAllUsersSynced);
router.post("/sync-users", protect, adminOnly, syncUsers);
router.patch("/users/:id/password", protect, adminOnly, resetUserPassword);
router.get("/portal-state/:key", protect, getPortalState);
router.put("/portal-state/:key", protect, savePortalState);
router.patch("/portal-state/:key", protect, patchPortalState);

export default router;
