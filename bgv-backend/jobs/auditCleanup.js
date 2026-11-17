// bgv-backend/jobs/auditCleanup.js
//
// Deletes statusAudit entries older than RETENTION_MONTHS (rolling 3 months).
// Mirrors reportCleanup.js exactly in structure and safety pattern.
//
// SAFETY: starts in preview mode. While DRY_RUN = true it only LOGS what
// it would delete and deletes NOTHING. To enable real deletion, change
// DRY_RUN to false and restart the backend.

import StatusAudit from "../models/StatusAudit.js";

/* ───────────────────────── SETTINGS ───────────────────────── */

// true  = PREVIEW ONLY (logs what would be deleted, deletes nothing)
// false = REAL deletion of audit entries
const DRY_RUN = false;

// Delete entries older than this many days (3 months ≈ 90 days)
const RETENTION_DAYS = 90;

/* ─────────────────────────────────────────────────────────── */

export async function cleanupOldAudit() {
  try {
    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    const count = await StatusAudit.countDocuments({
      timestamp: { $lt: cutoff },
    });

    console.log(
      `[auditCleanup] ${new Date().toISOString()} | DRY_RUN=${DRY_RUN} | retention=${RETENTION_DAYS}d | cutoff=${cutoff.toISOString()} | eligible=${count}`
    );

    if (count === 0) {
      return { eligible: 0, deleted: 0, dryRun: DRY_RUN };
    }

    if (DRY_RUN) {
      console.log(`[auditCleanup] WOULD DELETE ${count} audit entries (DRY_RUN=true)`);
      return { eligible: count, deleted: 0, dryRun: true };
    }

    const result = await StatusAudit.deleteMany({
      timestamp: { $lt: cutoff },
    });

    console.log(
      `[auditCleanup] done | deleted=${result.deletedCount}`
    );

    return { eligible: count, deleted: result.deletedCount, dryRun: false };
  } catch (err) {
    console.error("[auditCleanup] error:", err.message);
    return { error: err.message };
  }
}

// Runs once shortly after startup (for easy verification in logs),
// then once every 24 hours.
export function startAuditCleanupSchedule() {
  const DAY = 24 * 60 * 60 * 1000;

  // first run 20s after boot (offset from reportCleanup's 15s so logs don't interleave)
  setTimeout(() => {
    cleanupOldAudit();
  }, 20 * 1000);

  // then every 24h
  setInterval(() => {
    cleanupOldAudit();
  }, DAY);

  console.log(
    `[auditCleanup] scheduled every 24h | DRY_RUN=${DRY_RUN} | retention=${RETENTION_DAYS} days`
  );
}
