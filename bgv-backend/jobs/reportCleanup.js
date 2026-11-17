// bgv-backend/jobs/reportCleanup.js
//
// Deletes ONLY the uploaded report PDF file (keeps the record and all its data)
// once a Closed/Completed record's report is older than RETENTION_DAYS.
// The countdown is anchored on `reportUploadedAt`.
//
// SAFETY: starts in preview mode.
//   DRY_RUN = true  → only LOGS what would be deleted, touches nothing.
//   DRY_RUN = false → real deletion of files + clearing of DB report fields.
//
// TO GO LIVE: change line 28 → const DRY_RUN = false;  then: pm2 restart bgv-backend
// MANUAL TEST RUN (on server): node -e "import('./jobs/reportCleanup.js').then(m=>m.cleanupOldReports())"
//   or just restart pm2 (runs 15s after boot automatically).

import path from "path";
import fs   from "fs";
import { fileURLToPath } from "url";

import Record from "../models/Record.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Report PDFs live at <backend>/uploads/reports/
const REPORTS_DIR = path.join(__dirname, "..", "uploads", "reports");

/* ─────────────────── SETTINGS (easy to configure) ─────────────────── */

// ⚠️  FLIP THIS TO false TO GO LIVE (then pm2 restart bgv-backend)
// Paused 2026-07-18 for the S3 migration: this job deletes local report
// files, which would race against the migration copying them to S3 first.
// Re-enable (and rewrite to delete S3 objects instead of local files) only
// after the migration is confirmed complete, on explicit approval.
const DRY_RUN = true;

// Days after the report was uploaded before its file is permanently removed.
const RETENTION_DAYS = 60;

/* ─────────────────────────────────────────────────────────────────── */

function isClosedStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "closed" || s === "close" || s === "completed" || s === "complete";
}

export async function cleanupOldReports() {
  const runAt  = new Date().toISOString();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    // Find all records that have a report file with a known upload date older than cutoff.
    const candidates = await Record.find({
      reportUploaded:   true,
      reportFile:       { $nin: ["", null] },
      reportUploadedAt: { $ne: null, $lte: cutoff },
    })
      .select("_id status reportFile reportFileName reportUploadedAt clientName candidateName")
      .lean();

    // Only Closed/Completed cases — skip active records.
    const eligible = candidates.filter(r => isClosedStatus(r.status));

    console.log(
      `[reportCleanup] ${runAt} | DRY_RUN=${DRY_RUN} | retention=${RETENTION_DAYS}d` +
      ` | cutoff=${cutoff.toISOString()} | scanned=${candidates.length} | eligible=${eligible.length}`
    );

    if (eligible.length === 0) {
      console.log(`[reportCleanup] done | nothing to do`);
      return { scanned: candidates.length, eligible: 0, removed: 0, failed: 0, dryRun: DRY_RUN };
    }

    let removed = 0;
    let failed  = 0;
    const failedIds = [];

    for (const r of eligible) {
      // path.basename() guarantees we can only ever touch a file inside REPORTS_DIR.
      const fileName  = path.basename(String(r.reportFile || ""));
      const diskPath  = path.join(REPORTS_DIR, fileName);
      const uploadedAt = r.reportUploadedAt ? new Date(r.reportUploadedAt).toISOString() : "?";
      const label     = `record=${r._id} | ${r.clientName || "-"} / ${r.candidateName || "-"} | uploaded=${uploadedAt} | file=${fileName}`;

      console.log(`  - ${DRY_RUN ? "WOULD REMOVE" : "REMOVING"} | ${label}`);

      if (DRY_RUN) continue;

      // ── 1. Delete the file from disk ─────────────────────────────────────
      let fileOk = true;
      if (fileName) {
        try {
          if (fs.existsSync(diskPath)) {
            fs.unlinkSync(diskPath);
          }
          // File already gone is fine — still clear the DB reference below.
        } catch (e) {
          console.error(`    ! file delete failed for ${fileName}: ${e.message} — skipping DB clear`);
          failed++;
          failedIds.push(String(r._id));
          fileOk = false;
        }
      }

      if (!fileOk) continue; // don't leave a half-deleted state

      // ── 2. Clear ALL report fields on the record (record itself is kept) ─
      //    Both the top-level schema fields AND rawData.* must be cleared so
      //    the portal correctly shows "no report uploaded" for this case.
      try {
        await Record.updateOne(
          { _id: r._id },
          {
            $set: {
              // top-level fields
              reportFile:       "",
              reportFileName:   "",
              reportUploaded:   false,
              reportUploadedAt: null,
              reportUploadedBy: "",
              // rawData mirror (set by uploadController at upload time)
              "rawData.reportFile":       "",
              "rawData.reportFileName":   "",
              "rawData.reportUploaded":   false,
              "rawData.reportUploadedAt": null,
              "rawData.reportUploadedBy": "",
            },
          }
        );
        removed++;
        console.log(`    ✓ cleared | ${label}`);
      } catch (e) {
        console.error(`    ! DB clear failed for record=${r._id}: ${e.message}`);
        failed++;
        failedIds.push(String(r._id));
      }
    }

    console.log(
      `[reportCleanup] done | ${DRY_RUN ? "previewed" : "removed"}=${DRY_RUN ? eligible.length : removed}` +
      (!DRY_RUN ? ` | failed=${failed}` : "") +
      (failedIds.length ? ` | failed_ids=${failedIds.join(",")}` : "")
    );

    return {
      scanned:  candidates.length,
      eligible: eligible.length,
      removed:  DRY_RUN ? 0 : removed,
      failed:   DRY_RUN ? 0 : failed,
      failedIds,
      dryRun:   DRY_RUN,
    };
  } catch (err) {
    console.error(`[reportCleanup] fatal error: ${err.message}`);
    return { error: err.message };
  }
}

// Runs once 15s after startup (visible immediately in `pm2 logs`),
// then every 24 hours.
export function startReportCleanupSchedule() {
  const DAY = 24 * 60 * 60 * 1000;

  setTimeout(() => { cleanupOldReports(); }, 15 * 1000);
  setInterval(() => { cleanupOldReports(); }, DAY);

  console.log(
    `[reportCleanup] scheduled every 24h | DRY_RUN=${DRY_RUN} | retention=${RETENTION_DAYS} days`
  );
}
