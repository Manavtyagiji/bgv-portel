// bgv-backend/routes/digitalAddressRoutes.js
// Two very different trust levels: the candidate-submission route is
// deliberately PUBLIC (the candidate has no portal account — this is the
// whole point of the link), while the report-view route requires login AND
// is further restricted to super admin + their own internal team.
import express from "express";
import multer from "multer";
import { protect } from "../middleware/authMiddleware.js";
import {
  submitDigitalAddressVerification,
  getDigitalAddressReport,
  requireSuperScope,
} from "../controllers/digitalAddressController.js";

const router = express.Router();

// Memory storage only — buffers go straight to S3, same no-disk-write
// pattern as the main portal's report-file upload.
const candidateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
});

router.post(
  "/address-verify/submit",
  candidateUpload.fields(
    ["selfie", "addressProof", "housePic", "landmarkPic", "signature"].map((name) => ({ name, maxCount: 1 }))
  ),
  submitDigitalAddressVerification
);

router.get("/digital-address/report/:id", protect, requireSuperScope, getDigitalAddressReport);

export default router;
