// bgv-backend/scripts/fixSpecialBillingDateYear.mjs
//
// One-time cleanup for records whose specialBillingDate was saved with a
// bad year (e.g. year 22 instead of 2022/2026) by the now-fixed input bug
// (a native <input type="date"> mid-typing snapshot, e.g. "0022-07-21").
//
// DEFAULT MODE (no flags) is REPORT-ONLY — it changes nothing. It lists
// every affected record (Check Id, candidate, client, current bad date, and
// a SUGGESTED corrected date) so you can eyeball them before anything is
// written. The day/month portion of a bad record is trustworthy (the bug
// only ever mangled the year); the suggested year is the bad year's last
// two digits + 2000 (e.g. year 22 -> 2022) — this matches what the browser
// actually had typed at the moment it saved, but it is a GUESS about what
// you originally intended, not a certainty (e.g. if you meant 2026 but only
// "22" had been typed when it saved, the suggestion will say 2022, not
// 2026). Review the list before applying.
//
// USAGE (run on the server, from bgv-backend/):
//   node scripts/fixSpecialBillingDateYear.mjs                 # report only, no writes
//   node scripts/fixSpecialBillingDateYear.mjs --apply         # apply the suggested fix to every listed record
//   node scripts/fixSpecialBillingDateYear.mjs --apply --id=<recordId>   # apply to just one record, after you've confirmed the real date

import "dotenv/config";
import mongoose from "mongoose";
import Record from "../models/Record.js";

const APPLY = process.argv.includes("--apply");
const idArg = process.argv.find(a => a.startsWith("--id="));
const onlyId = idArg ? idArg.split("=")[1] : null;

function suggestFix(badDate) {
  const y = badDate.getFullYear();
  const suggestedYear = y < 100 ? y + 2000 : y;
  const fixed = new Date(badDate);
  fixed.setFullYear(suggestedYear);
  return { suggestedYear, fixed };
}

async function main() {
  console.log("[fixSpecialBillingDateYear] connecting...");
  await mongoose.connect(process.env.MONGO_URI);

  const query = {
    specialBillingDate: { $ne: null, $exists: true },
    ...(onlyId ? { _id: onlyId } : {}),
  };

  const candidates = await Record.find(query).lean();
  const bad = candidates.filter(r => {
    const d = new Date(r.specialBillingDate);
    if (Number.isNaN(d.getTime())) return false;
    const y = d.getFullYear();
    return y < 2000 || y > 2100;
  });

  if (bad.length === 0) {
    console.log("[fixSpecialBillingDateYear] No bad-year specialBillingDate records found. Nothing to do.");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log("");
  console.log(`──────── ${bad.length} record(s) with a bad specialBillingDate year ────────`);
  for (const r of bad) {
    const badDate = new Date(r.specialBillingDate);
    const { suggestedYear, fixed } = suggestFix(badDate);
    const checkId = r.rawData?.["Check Id"] || r.rawData?.["Case ID"] || "(no Check Id)";
    console.log(
      `  _id=${r._id}  checkId=${checkId}  candidate=${r.candidateName || r.rawData?.["Candidate Name"] || "?"}\n` +
      `      current: ${badDate.toISOString().slice(0,10)} (year ${badDate.getFullYear()})\n` +
      `      suggested fix: ${fixed.toISOString().slice(0,10)} (year ${suggestedYear})`
    );
  }
  console.log("──────────────────────────────────────────────────────────────────");
  console.log("");

  if (!APPLY) {
    console.log("Report only — no changes made. Re-run with --apply to write the suggested fixes,");
    console.log("or with --apply --id=<recordId> to fix just one record after confirming the real date");
    console.log("(e.g. via the Special Case date field in the Records table, now that the input bug is fixed).");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log("Applying suggested fixes...");
  for (const r of bad) {
    const badDate = new Date(r.specialBillingDate);
    const { fixed } = suggestFix(badDate);
    const iso = fixed.toISOString().slice(0, 10);
    await Record.updateOne(
      { _id: r._id },
      {
        $set: {
          specialBillingDate: fixed,
          "rawData.specialBillingDate": iso,
        },
      }
    );
    console.log(`  fixed _id=${r._id} -> ${iso}`);
  }

  console.log(`[fixSpecialBillingDateYear] Done — ${bad.length} record(s) updated.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error("[fixSpecialBillingDateYear] fatal error:", err);
  process.exit(1);
});
