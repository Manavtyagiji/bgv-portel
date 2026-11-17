// bgv-backend/scripts/migrateReportsToS3.mjs
//
// One-time migration: copies every existing local report PDF up to S3 and
// records the S3 key on the record. Local originals are NEVER touched —
// this script only reads them, never deletes or moves anything.
//
// Safety properties:
//   - DRY RUN BY DEFAULT. Nothing is written to S3 or Mongo unless you pass --commit.
//   - IDEMPOTENT / RESUMABLE: only considers records that don't already have
//     reportS3Key set, so re-running (e.g. after an interruption) picks up
//     exactly where it left off — already-migrated records are skipped.
//   - VERIFY BEFORE MARK: after uploading, a HeadObject call confirms the
//     object actually exists in S3 with the expected size before the record
//     is updated. If verification fails, the record is left untouched and
//     reported as a failure.
//   - Only ever sets `reportS3Key` on a record. No other field is changed,
//     nothing is deleted.
//
// USAGE (run on the server, from bgv-backend/):
//   node scripts/migrateReportsToS3.mjs                → dry run, all candidates
//   node scripts/migrateReportsToS3.mjs --limit=20      → dry run, first 20 only (for a small test batch)
//   node scripts/migrateReportsToS3.mjs --commit         → real run, all candidates
//   node scripts/migrateReportsToS3.mjs --commit --limit=20  → real run, first 20 only

import "dotenv/config";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import Record from "../models/Record.js";
import { uploadBufferToS3, headObjectInfo } from "../utils/s3.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPORTS_DIR = path.join(__dirname, "..", "uploads", "reports");

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const limitArg = args.find(a => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Mirrors the same local-path resolution already used elsewhere (sendCaseMail,
// reportCleanup) — reportFile is a relative "/uploads/reports/<name>" path.
function resolveLocalPath(reportFile) {
  const relativePath = String(reportFile || "").replace(/^\/+/, "");
  const candidates = [
    path.join(__dirname, "..", relativePath),
    path.join(REPORTS_DIR, path.basename(relativePath)),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

async function main() {
  console.log(`[migrateReportsToS3] starting | mode=${COMMIT ? "COMMIT (real)" : "DRY RUN"}${LIMIT ? ` | limit=${LIMIT}` : ""}`);

  await mongoose.connect(process.env.MONGO_URI);

  const query = {
    reportUploaded: true,
    reportFile: { $nin: ["", null] },
    $or: [{ reportS3Key: { $exists: false } }, { reportS3Key: "" }],
  };

  let cursor = Record.find(query).select("_id reportFile reportFileName reportS3Key");
  if (LIMIT) cursor = cursor.limit(LIMIT);
  const candidates = await cursor.lean();

  console.log(`[migrateReportsToS3] candidates found: ${candidates.length}`);

  let totalBytes = 0;
  let migrated = 0, migratedBytes = 0;
  let skippedNoLocalFile = 0;
  let failed = 0;
  const notFoundLocally = [];
  const failures = [];

  for (const record of candidates) {
    const localPath = resolveLocalPath(record.reportFile);

    if (!localPath) {
      skippedNoLocalFile++;
      notFoundLocally.push({ id: String(record._id), reportFile: record.reportFile });
      continue;
    }

    const size = fs.statSync(localPath).size;
    totalBytes += size;

    if (!COMMIT) {
      continue; // dry run: just tally, don't touch S3 or Mongo
    }

    try {
      const s3Key = `reports/${record._id}/${path.basename(localPath)}`;
      const buffer = fs.readFileSync(localPath);
      await uploadBufferToS3(buffer, s3Key, "application/pdf");

      const info = await headObjectInfo(s3Key);
      if (!info.exists || info.size !== size) {
        throw new Error(
          `verify failed: exists=${info.exists} s3Size=${info.size} localSize=${size}`
        );
      }

      await Record.updateOne(
        { _id: record._id },
        { $set: { reportS3Key: s3Key } }
      );

      migrated++;
      migratedBytes += size;
      console.log(`  ✓ migrated | record=${record._id} | ${path.basename(localPath)} | ${fmtBytes(size)}`);
    } catch (err) {
      failed++;
      failures.push({ id: String(record._id), file: localPath, error: err.message });
      console.error(`  ✗ FAILED | record=${record._id} | ${err.message}`);
    }
  }

  console.log("");
  console.log("──────────────── SUMMARY ────────────────");
  console.log(`mode:                ${COMMIT ? "COMMIT (real)" : "DRY RUN — nothing was changed"}`);
  console.log(`candidates found:    ${candidates.length}`);
  if (!COMMIT) {
    console.log(`would migrate:       ${candidates.length - skippedNoLocalFile}`);
    console.log(`total size:          ${fmtBytes(totalBytes)}`);
  } else {
    console.log(`migrated:            ${migrated} (${fmtBytes(migratedBytes)})`);
    console.log(`failed:              ${failed}`);
  }
  console.log(`no local file found: ${skippedNoLocalFile} (already gone from disk — cannot be migrated, nothing to copy)`);

  if (notFoundLocally.length > 0) {
    console.log("");
    console.log("Records whose report file is missing from local disk (likely already removed by the report-cleanup job before this migration ran):");
    notFoundLocally.forEach(r => console.log(`  - record=${r.id} reportFile=${r.reportFile}`));
  }

  if (failures.length > 0) {
    console.log("");
    console.log("Failures (record left untouched, safe to re-run):");
    failures.forEach(f => console.log(`  - record=${f.id} file=${f.file} error=${f.error}`));
  }

  console.log("──────────────────────────────────────────");

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("[migrateReportsToS3] fatal error:", err);
  process.exit(1);
});
