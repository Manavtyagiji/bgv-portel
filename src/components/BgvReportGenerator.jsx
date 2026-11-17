import { useRef, useState } from "react";
import { uploadAPI } from "../api/api";

// Pulls a value out of a record by checking several possible field-name
// variants — same "many fallback names" convention used everywhere else in
// this app, since the same logical field (e.g. DOB) can be stored under
// different header names depending on which client's Excel it came from.
function pick(row, ...names) {
  for (const n of names) {
    const v = row?.[n] ?? row?.rawData?.[n];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function recordToAutofill(row) {
  return {
    caseRefNo: pick(row, "Check Id", "Case ID"),
    pName: pick(row, "Candidate Name"),
    pFatherName: pick(row, "Candidate Father Name"),
    pDob: pick(row, "Date of Birth (DD-MM-YYYY)", "Date of Birth", "DOB"),
    pAddress: pick(row, "Address"),
  };
}

// Normalizes a raw date value (which can arrive in many different formats —
// "21 Sept 2026", "21/09/2026", an Excel serial number, ISO, etc., same
// inconsistency this app has dealt with everywhere else) to a plain
// YYYY-MM-DD string, so it can be compared reliably against the browser's
// native <input type="date"> value instead of matching on raw text.
function normalizeToIsoDate(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let d = Number(dmy[1]), m = Number(dmy[2]), y = Number(dmy[3]);
    if (y < 100) y += 2000;
    if (d > 12 && m <= 12) { /* d stays day, m stays month */ }
    else if (m > 12 && d <= 12) { const t = d; d = m; m = t; }
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const serial = Number(s);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const jsDate = new Date(excelEpoch.getTime() + serial * 86400000);
    if (!Number.isNaN(jsDate.getTime())) return jsDate.toISOString().slice(0, 10);
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return "";
}

export default function BgvReportGenerator() {
  const iframeRef = useRef(null);
  const [checkId, setCheckId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");
  const [matches, setMatches] = useState([]);

  const [bulkDate, setBulkDate] = useState("");
  const [bulkCheckName, setBulkCheckName] = useState("");
  const [bulkResult, setBulkResult] = useState("red");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  const fillFrom = (row) => {
    const data = recordToAutofill(row);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "bgv-autofill", data },
      window.location.origin
    );
    setMatches([]);
    setSearchMsg(`Filled from ${row.candidateName || data.pName || "record"} (Check Id: ${data.caseRefNo || "—"}).`);
  };

  const handleSearch = async () => {
    const q = checkId.trim();
    if (!q) return;
    setSearching(true);
    setSearchMsg("");
    setMatches([]);
    try {
      const res = await uploadAPI.getRecords({ search: q, limit: 10 });
      const rows = Array.isArray(res) ? res : (res?.records || res?.data || []);
      if (!rows.length) {
        setSearchMsg(`No case found matching "${q}".`);
      } else if (rows.length === 1) {
        fillFrom(rows[0]);
      } else {
        // Several records can share a Check Id at different addresses
        // (same duplicate-detection rule used across the rest of the app) —
        // let the user pick which one to fill from instead of guessing.
        setMatches(rows);
        setSearchMsg(`${rows.length} matching cases found — pick one:`);
      }
    } catch (err) {
      setSearchMsg(`Search failed: ${err.message || err}`);
    } finally {
      setSearching(false);
    }
  };

  const handleBulkGenerate = async () => {
    if (!bulkDate || !bulkCheckName.trim()) return;
    setBulkRunning(true);
    setBulkMsg("Finding matching cases…");
    try {
      // Server-side filter narrows by Check Name (a reliable exact field
      // match); the Assigned Date itself is compared client-side below,
      // normalized, since raw date text in this data isn't consistently
      // formatted — a plain text match on the date would silently miss rows.
      const filters = JSON.stringify([
        { column: "Check Name", condition: "contains", value: bulkCheckName.trim() },
      ]);
      const res = await uploadAPI.getRecords({ filters, limit: 5000 });
      const rows = Array.isArray(res) ? res : (res?.records || res?.data || []);

      const matched = rows.filter((row) => {
        const assignedRaw = pick(row, "Assigned Date", "Assign Date") || row.assignDate || row.assignedDate;
        return normalizeToIsoDate(assignedRaw) === bulkDate;
      });

      if (!matched.length) {
        setBulkMsg(`No cases found for "${bulkCheckName.trim()}" on ${bulkDate}.`);
        setBulkRunning(false);
        return;
      }

      const bulkRows = matched.map((row) => ({
        result: bulkResult,
        ...recordToAutofill(row),
      }));

      setBulkMsg(`Generating ${bulkRows.length} report(s)… this tab will show progress below the form.`);
      iframeRef.current?.contentWindow?.postMessage(
        { type: "bgv-bulk-generate", rows: bulkRows },
        window.location.origin
      );
    } catch (err) {
      setBulkMsg(`Bulk generate failed: ${err.message || err}`);
    } finally {
      setBulkRunning(false);
    }
  };

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border2, #e2e8f0)",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search Check Id to auto-fill the form…"
          value={checkId}
          onChange={(e) => setCheckId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          style={{
            flex: "1 1 280px",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--border2, #cbd5e1)",
            fontSize: 13,
          }}
        />
        <button
          onClick={handleSearch}
          disabled={searching || !checkId.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent, #2563eb)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            cursor: searching ? "not-allowed" : "pointer",
            opacity: searching ? 0.7 : 1,
          }}
        >
          {searching ? "Searching…" : "🔍 Search & Fill"}
        </button>
        {searchMsg && (
          <span style={{ fontSize: 12.5, color: "var(--text3, #64748b)" }}>{searchMsg}</span>
        )}
      </div>

      {matches.length > 0 && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border2, #e2e8f0)", display: "flex", flexDirection: "column", gap: 6 }}>
          {matches.map((row, i) => (
            <button
              key={row._id || i}
              onClick={() => fillFrom(row)}
              style={{
                textAlign: "left",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border2, #cbd5e1)",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12.5,
              }}
            >
              <b>{row.candidateName || pick(row, "Candidate Name") || "(no name)"}</b>
              {" — "}
              {pick(row, "Check Id", "Case ID") || "no Check Id"}
              {" — "}
              {pick(row, "Address") || "no address"}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border2, #e2e8f0)",
          flexWrap: "wrap",
          background: "var(--bg2, #f8fafc)",
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text3, #64748b)" }}>
          Bulk by date + check:
        </span>
        <input
          type="date"
          value={bulkDate}
          onChange={(e) => setBulkDate(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border2, #cbd5e1)", fontSize: 13 }}
        />
        <input
          type="text"
          placeholder="Check name (e.g. Address Check)"
          value={bulkCheckName}
          onChange={(e) => setBulkCheckName(e.target.value)}
          style={{ flex: "1 1 220px", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border2, #cbd5e1)", fontSize: 13 }}
        />
        <select
          value={bulkResult}
          onChange={(e) => setBulkResult(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border2, #cbd5e1)", fontSize: 13 }}
        >
          <option value="red">Red · High Risk</option>
          <option value="green">Green · No Risk</option>
        </select>
        <button
          onClick={handleBulkGenerate}
          disabled={bulkRunning || !bulkDate || !bulkCheckName.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent-dark, #1f6fb2)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            cursor: bulkRunning ? "not-allowed" : "pointer",
            opacity: bulkRunning ? 0.7 : 1,
          }}
        >
          {bulkRunning ? "Finding…" : "⬇️ Generate All PDFs"}
        </button>
        {bulkMsg && (
          <span style={{ fontSize: 12.5, color: "var(--text3, #64748b)", flexBasis: "100%" }}>{bulkMsg}</span>
        )}
      </div>

      <iframe
        ref={iframeRef}
        src="/bgv-report-generator.html"
        title="BGV Report Generator"
        style={{
          width: "100%",
          height: "calc(100vh - 220px)",
          minHeight: 600,
          border: "none",
          display: "block",
        }}
      />
    </div>
  );
}
