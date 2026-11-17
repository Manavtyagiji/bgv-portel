// bgv-backend/scripts/deleteLocalMigratedReports.mjs
//
// Deletes local report PDFs ONLY for records that are confirmed migrated to
// S3 (reportS3Key set) — frees disk space now that the portal serves those
// reports from S3, not local disk.
//
// Safety properties:
//   - DRY RUN BY DEFAULT. Nothing is deleted unless you pass --commit.
//   - ONLY touches records with reportS3Key set. A record without
//     reportS3Key (not migrated, or one of the already-missing 676) is never
//     considered — its local file (if any) is left completely alone.
//   - RE-VERIFIES S3 before every delete: right before deleting a local
//     file, does a fresh HeadObject call to confirm that exact S3 object
//     still exists with a matching size. If that check fails for any
//     reason, that file is skipped and reported as a failure — never
//     deleted on faith.
//   - Never touches the database. Only deletes local files. reportS3Key,
//     reportFile, and every other field are left exactly as they are.
//
// USAGE (run on the server, from bgv-backend/):
//   node scripts/deleteLocalMigratedReports.mjs                → dry run, all candidates
//   node scripts/deleteLocalMigratedReports.mjs --limit=20      → dry run, first 20 only
//   node scripts/deleteLocalMigratedReports.mjs --commit        → real run, all candidates
//   node scripts/deleteLocalMigratedReports.mjs --commit --limit=20  → real run, first 20 only

import "dotenv/config";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import Record from "../models/Record.js";
import { headObjectInfo } from "../utils/s3.js";

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

// Mirrors the same local-path resolution used by the migration script and
// sendCaseMail — reportFile is a relative "/uploads/reports/<name>" path.
function resolveLocalPath(reportFile) {
  const relativePath = String(reportFile || "").replace(/^\/+/, "");
  const candidates = [
    path.join(__dirname, "..", relativePath),
    path.join(REPORTS_DIR, path.basename(relativePath)),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

async function main() {
  console.log(`[deleteLocalMigratedReports] starting | mode=${COMMIT ? "COMMIT (real)" : "DRY RUN"}${LIMIT ? ` | limit=${LIMIT}` : ""}`);

  await mongoose.connect(process.env.MONGO_URI);

  const query = { reportS3Key: { $nin: ["", null] } };

  let cursor = Record.find(query).select("_id reportFile reportS3Key");
  if (LIMIT) cursor = cursor.limit(LIMIT);
  const candidates = await cursor.lean();

  console.log(`[deleteLocalMigratedReports] migrated records found: ${candidates.length}`);

  let totalBytes = 0;
  let deleted = 0, deletedBytes = 0;
  let noLocalFile = 0;
  let failed = 0;
  const failures = [];

  for (const record of candidates) {
    const localPath = resolveLocalPath(record.reportFile);

    if (!localPath) {
      noLocalFile++; // already gone (or never had a local copy) — nothing to delete
      continue;
    }

    const size = fs.statSync(localPath).size;
    totalBytes += size;

    if (!COMMIT) {
      continue; // dry run: just tally
    }

    try {
      // Re-verify RIGHT NOW, not just trusting the migration ran correctly
      // earlier — confirms this exact object is still present in S3 with a
      // matching size before this local copy is removed.
      const info = await headObjectInfo(record.reportS3Key);
      if (!info.exists || info.size !== size) {
        throw new Error(
          `S3 re-verify failed: exists=${info.exists} s3Size=${info.size} localSize=${size}`
        );
      }

      fs.unlinkSync(localPath);
      deleted++;
      deletedBytes += size;
      console.log(`  ✓ deleted | record=${record._id} | ${path.basename(localPath)} | ${fmtBytes(size)}`);
    } catch (err) {
      failed++;
      failures.push({ id: String(record._id), file: localPath, error: err.message });
      console.error(`  ✗ FAILED | record=${record._id} | ${err.message}`);
    }
  }

  console.log("");
  console.log("──────────────── SUMMARY ────────────────");
  console.log(`mode:                ${COMMIT ? "COMMIT (real)" : "DRY RUN — nothing was deleted"}`);
  console.log(`migrated records:    ${candidates.length}`);
  if (!COMMIT) {
    console.log(`would delete:        ${candidates.length - noLocalFile}`);
    console.log(`total size:          ${fmtBytes(totalBytes)}`);
  } else {
    console.log(`deleted:             ${deleted} (${fmtBytes(deletedBytes)} freed)`);
    console.log(`failed:              ${failed}`);
  }
  console.log(`no local file:       ${noLocalFile} (already gone — nothing to do)`);

  if (failures.length > 0) {
    console.log("");
    console.log("Failures (local file left in place, safe to re-run):");
    failures.forEach(f => console.log(`  - record=${f.id} file=${f.file} error=${f.error}`));
  }

  console.log("──────────────────────────────────────────");

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("[deleteLocalMigratedReports] fatal error:", err);
  process.exit(1);
});
