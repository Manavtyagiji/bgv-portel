// bgv-backend/routes/inboxRoutes.js
// Stage 1 — read-only inbox. Every route requires auth; the mailbox OWNER is
// always resolved server-side from req.user (never client-supplied), so
// cross-organization mailbox access is not possible. Super Admin/Manager may
// additionally pick WHICH of that owner's own configured accounts to use via
// ?accountId=, and Team/TL read whichever account has been allocated to them
// — both still resolve within the same server-determined owner only.

import express from "express";
import multer from "multer";
import { protect } from "../middleware/authMiddleware.js";
import { listMessages, getMessage, getAttachment, replyToMessage, setMessageReadState, composeMessage, listInboxAccounts } from "../controllers/inboxController.js";

const router = express.Router();

// Memory storage only — reply attachments pass straight from the upload
// buffer into the outgoing email and are never written to disk, same
// no-disk-storage principle as the rest of the Inbox feature.
const replyAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
});

router.get("/accounts", protect, listInboxAccounts);
router.get("/messages", protect, listMessages);
router.get("/messages/:uid", protect, getMessage);
router.get("/messages/:uid/attachments/:index", protect, getAttachment);
router.post("/messages/:uid/reply", protect, replyAttachmentUpload.array("attachments", 5), replyToMessage);
router.post("/messages/:uid/read", protect, setMessageReadState);
router.post("/compose", protect, replyAttachmentUpload.array("attachments", 5), composeMessage);

export default router;
