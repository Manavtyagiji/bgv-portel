// Runs the CPU-heavy part of the full-detail export (building + zipping the
// XLSX workbook) on a separate thread. The main server's event loop is
// single-threaded — json_to_sheet + XLSX.write together block it for
// 15-25+ seconds for a tenant this size, during which EVERY other request
// (every other user's page, every polling call) queues up and the export's
// own response write can itself stall, surfacing in the browser as a
// connection drop ("net::ERR_FAILED") even though the server logged 200.
// Doing this in a worker keeps the main thread free the whole time.
import { parentPort, workerData } from "worker_threads";
import XLSX from "xlsx";

// Array-of-arrays, not array-of-objects — passing 59k+ objects with
// repeated string keys through postMessage's structured-clone is itself
// slow (tripled this worker's wall time in testing); a header row plus
// plain value arrays clones much faster and is all aoa_to_sheet needs.
const { aoa } = workerData;

const CANONICAL_DATE_RE = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
const DATE_DISPLAY_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const toDisplayDateStr = (v) => {
  if (typeof v !== "string") return v;
  const m = v.match(CANONICAL_DATE_RE);
  if (!m) return v;
  const [, d, mo, y] = m;
  return `${d}/${mo}/${y}`;
};

const converted = aoa.map((row, i) =>
  i === 0 ? row : row.map((v) => (v === undefined || v === null ? "" : toDisplayDateStr(v)))
);

const ws = XLSX.utils.aoa_to_sheet(converted);

Object.keys(ws).forEach((addr) => {
  if (addr[0] === "!") return;
  const cell = ws[addr];
  if (cell && cell.t === "s" && typeof cell.v === "string" && DATE_DISPLAY_RE.test(cell.v)) {
    cell.z = "@";
  }
});

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Records");
// compression defaults to OFF in this library — without it, the zip
// container stores every cell uncompressed, which is most of why this file
// was ~140MB for mostly-repetitive text data. Enabling it shrinks the file
// substantially, which matters directly for how reliably it transfers over
// a real internet connection within any proxy's timeout window.
const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer", compression: true });

// Buffer.buffer can be a view into a larger pooled ArrayBuffer — transferring
// it as-is would detach memory that may be shared with unrelated data. Slice
// out exactly this buffer's own bytes into a standalone ArrayBuffer first.
const standalone = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
parentPort.postMessage(standalone, [standalone]);
