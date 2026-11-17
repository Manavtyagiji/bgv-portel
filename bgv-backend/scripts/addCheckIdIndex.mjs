// bgv-backend/scripts/addCheckIdIndex.mjs
//
// One-time: explicitly creates the rawData."Check Id" index on the live
// collection (rather than relying on Mongoose's implicit autoIndex-on-
// connect, which would otherwise only happen silently on the next server
// restart). Purely additive — creates an index, touches no documents, no
// existing index, and no other data.
//
// USAGE (run on the server, from bgv-backend/):
//   node scripts/addCheckIdIndex.mjs

import "dotenv/config";
import mongoose from "mongoose";
import Record from "../models/Record.js";

async function main() {
  console.log("[addCheckIdIndex] connecting...");
  await mongoose.connect(process.env.MONGO_URI);

  console.log('[addCheckIdIndex] creating index on "rawData.Check Id" (this may take a moment)...');
  const start = Date.now();
  const name = await Record.collection.createIndex({ "rawData.Check Id": 1 });
  const ms = Date.now() - start;
  console.log(`[addCheckIdIndex] created index "${name}" in ${ms}ms`);

  const indexes = await Record.collection.indexes();
  console.log("");
  console.log("──────────────── Current indexes on Record collection ────────────────");
  indexes.forEach(idx => console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`));
  console.log("─────────────────────────────────────────────────────────────────────");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error("[addCheckIdIndex] fatal error:", err);
  process.exit(1);
});
