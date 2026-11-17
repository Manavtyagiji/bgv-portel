// bgv-backend/controllers/digitalAddressController.js
// Digital Address is just another check type in the main Records collection
// (Check Name = "Digital Address"), created the normal way through
// Excel-upload/Add Clients like every other check type — no separate case
// model. This file only handles the two things unique to this check type:
// (1) the public candidate-submission endpoint, which matches back to an
// EXISTING Record by Check Id and attaches the submission onto it, and
// (2) the protected "view submitted report" endpoint used from Records.
import Record from "../models/Record.js";
import { uploadBufferToS3, getPresignedViewUrl } from "../utils/s3.js";

const SUPER_ADMIN_EMAIL = "superadmin@tervies.com";

// Same "super admin's own internal staff" fallback used throughout this
// codebase (inboxController's getInboxOwnerEmail, MyTable.jsx's
// isInternalSuperTeam, addressVerifyController before it).
function isSuperScopeUser(user) {
  const role = String(user?.role || "").trim().toLowerCase();
  if (role === "superadmin" || role === "manager" || role === "tl") return true;
  if (role !== "team") return false;
  const tenantId = user?.tenantId || null;
  const ownerAdminEmail = user?.ownerAdminEmail
    ? String(user.ownerAdminEmail).trim().toLowerCase()
    : "";
  if (user?.isInternal === true || (!tenantId && !ownerAdminEmail)) return true;
  return ownerAdminEmail === SUPER_ADMIN_EMAIL;
}

export function requireSuperScope(req, res, next) {
  if (!isSuperScopeUser(req.user)) {
    return res.status(403).json({ error: "Not allowed for this account" });
  }
  next();
}

const FILE_FIELDS = ["selfie", "addressProof", "housePic", "landmarkPic", "signature"];

function randomSuffix(len = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// PUBLIC — no auth. The candidate has no portal account; this is reached
// only via the link an admin sends from a Records row. Matches back to the
// EXISTING "Digital Address" record by Check Id — never creates a new
// record, since every case must already exist in Records (uploaded the
// normal way) before a link can be generated for it.
export async function submitDigitalAddressVerification(req, res) {
  try {
    const form = JSON.parse(req.body?.form || "{}");
    const checkId = String(form.caseId || "").trim();
    if (!checkId || checkId === "NA") {
      return res.status(400).json({ success: false, message: "Missing case reference — this link is invalid." });
    }

    const record = await Record.findOne({
      checkName: { $regex: "digital address", $options: "i" },
      $or: [
        { "rawData.Check Id": checkId },
        { "rawData.Case ID": checkId },
      ],
    });
    if (!record) {
      return res.status(404).json({
        success: false,
        message: "No matching case found for this link. Please contact the verification team.",
      });
    }

    const verificationId = `AVR-${Date.now()}-${randomSuffix()}`;
    const files = req.files || {};
    const s3Patch = {};
    for (const field of FILE_FIELDS) {
      const uploaded = files[field]?.[0];
      if (!uploaded) continue;
      const ext = (uploaded.originalname.match(/\.[a-zA-Z0-9]+$/) || [".png"])[0];
      const key = `digital-address/${record._id}/${field}${ext}`;
      await uploadBufferToS3(uploaded.buffer, key, uploaded.mimetype);
      s3Patch[`${field}S3Key`] = key;
    }

    record.digitalAddressVerification = {
      fatherName: form.fatherName || "",
      dob: form.dob || "",
      gender: form.gender || "",
      verifierName: form.verifierName || "",
      relationWithVerifier: form.relationWithVerifier || "",
      periodOfStayFrom: form.periodOfStayFrom || "",
      periodOfStayTo: form.periodOfStayTo || "",
      natureOfResidence: form.natureOfResidence || "",
      nearestLandmark: form.nearestLandmark || "",
      presentAddress: form.presentAddress || "",
      gps: form.gps || null,
      gpsCity: form.gpsCity || "",
      gpsAddress: form.gpsAddress || "",
      verificationId,
      submittedAt: new Date(),
      selfieS3Key: s3Patch.selfieS3Key || "",
      addressProofS3Key: s3Patch.addressProofS3Key || "",
      housePicS3Key: s3Patch.housePicS3Key || "",
      landmarkPicS3Key: s3Patch.landmarkPicS3Key || "",
      signatureS3Key: s3Patch.signatureS3Key || "",
    };
    record.markModified("digitalAddressVerification");
    await record.save();

    res.json({ success: true, verificationId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// PROTECTED — super admin + internal team only. Resolves presigned URLs for
// a record's submitted Digital Address evidence, for the "View Report"
// button on its Records row.
export async function getDigitalAddressReport(req, res) {
  try {
    const record = await Record.findById(req.params.id).lean();
    if (!record?.digitalAddressVerification?.submittedAt) {
      return res.status(404).json({ success: false, error: "No submission found for this record" });
    }
    const d = record.digitalAddressVerification;
    const urls = {};
    for (const field of FILE_FIELDS) {
      const key = d[`${field}S3Key`];
      if (key) {
        try {
          urls[`${field}Url`] = await getPresignedViewUrl(key, 600);
        } catch {
          urls[`${field}Url`] = "";
        }
      }
    }
    res.json({ success: true, report: { ...d, ...urls } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
