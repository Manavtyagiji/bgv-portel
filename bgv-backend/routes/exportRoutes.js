import express from "express";
import { sendReport } from "../controllers/reportController.js";

const router = express.Router();

router.post("/send", sendReport);

export default router;