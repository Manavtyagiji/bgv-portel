// src/components/DigitalAddressRowActions.jsx
// Row-level actions for "Digital Address" check-type records — send the
// candidate their self-verification link, and view their submitted report
// once they've completed it. Rendered inline in MyTable.jsx's Action column,
// only for rows whose Check Name is "Digital Address" and only for super
// admin + their own internal team (isSuperScopeUser) — secondary admin never
// sees these buttons, same scoping this whole feature has had throughout.
import { useState } from "react";
import { buildLink, buildWA, WaIcon } from "./AddressVerification.jsx";
import { digitalAddressAPI } from "../api/api";

function isDigitalAddressCheck(row) {
  const checkName = String(row?.["Check Name"] || row?.checkName || "").trim().toLowerCase();
  return checkName === "digital address";
}

export default function DigitalAddressRowActions({ row, isSuperScopeUser }) {
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isSuperScopeUser || !isDigitalAddressCheck(row)) return null;

  const candidate = {
    name: row["Candidate Name"] || "",
    phone: row["Candidate Phone Number"] || row["Phone Number"] || row["Mobile Number"] || row.rawData?.["Candidate Phone Number"] || "",
    email: row["Candidate Email"] || row.rawData?.["Candidate Email"] || "",
    refid: row["Check Id"] || row["Case ID"] || row.rawData?.["Check Id"] || row.rawData?.["Case ID"] || "NA",
    client: row["Client Name"] || row.clientName || row.rawData?.["Client Name"] || "",
    address: row["Address"] || row["Full Address"] || row["Candidate Address"] || row.rawData?.["Address"] || "",
  };
  const link = buildLink(candidate);
  const submittedAt = row.digitalAddressVerification?.submittedAt;
  const recordId = row._id || row.id || row.recordId || row.rawData?._id || row.rawData?.id || "";

  const openReport = async () => {
    setShowReport(true);
    setLoading(true);
    setError("");
    try {
      const data = await digitalAddressAPI.getReport(recordId);
      setReport(data.report);
    } catch (err) {
      setError(err.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <a
        className="send-btn"
        href={buildWA(link, candidate.name, candidate.phone)}
        target="_blank"
        rel="noreferrer"
        title="Send the candidate their address-verification link on WhatsApp"
        style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <WaIcon /> Send Link
      </a>
      {submittedAt && (
        <button
          className="rpt-view-btn"
          onClick={openReport}
          style={{ background: "rgba(16,185,129,0.12)", color: "#059669", border: "1px solid rgba(16,185,129,0.30)" }}
        >
          📄 Report
        </button>
      )}

      {showReport && (
        <div
          onClick={(e) => e.target === e.currentTarget && setShowReport(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 10010,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div style={{
            background: "#fff", borderRadius: 14, padding: 22, width: "min(620px, 96vw)",
            maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>📄 Digital Address Report — {candidate.name}</div>
              <button onClick={() => setShowReport(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>

            {loading && <div style={{ padding: "24px 0", textAlign: "center", color: "#64748b" }}>⏳ Loading…</div>}
            {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>⚠️ {error}</div>}

            {report && !loading && (
              <>
                <div style={{ border: "1px solid #f1f5f9", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
                  {[
                    ["Father's Name", report.fatherName],
                    ["Date of Birth", report.dob],
                    ["Gender", report.gender],
                    ["Verifier", report.verifierName ? `${report.verifierName} (${report.relationWithVerifier || "—"})` : "—"],
                    ["Period of Stay", (report.periodOfStayFrom || report.periodOfStayTo) ? `${report.periodOfStayFrom || "—"} – ${report.periodOfStayTo || "—"}` : "—"],
                    ["Nature of Residence", report.natureOfResidence],
                    ["Nearest Landmark", report.nearestLandmark || "—"],
                    ["Address Verified", report.presentAddress || "—"],
                    ["Submitted At", report.submittedAt ? new Date(report.submittedAt).toLocaleString("en-IN") : "—"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ minWidth: 150, padding: "9px 12px", fontSize: 12, fontWeight: 700, color: "#64748b", background: "#f8fafc" }}>{k}</div>
                      <div style={{ padding: "9px 12px", fontSize: 13, color: "#0f172a", flex: 1 }}>{v || "—"}</div>
                    </div>
                  ))}
                  {report.gps?.lat && (
                    <div style={{ display: "flex" }}>
                      <div style={{ minWidth: 150, padding: "9px 12px", fontSize: 12, fontWeight: 700, color: "#64748b", background: "#f8fafc" }}>GPS Location</div>
                      <div style={{ padding: "9px 12px", fontSize: 13, color: "#0f172a", flex: 1 }}>
                        {report.gpsCity && <div>{report.gpsCity}</div>}
                        {report.gpsAddress && <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>{report.gpsAddress}</div>}
                        <a
                          href={`https://www.google.com/maps?q=${report.gps.lat},${report.gps.lng}`}
                          target="_blank" rel="noreferrer"
                          style={{ fontSize: 11.5, color: "#2563eb", fontWeight: 600, display: "block", marginTop: 4 }}
                        >
                          📍 {report.gps.lat.toFixed(6)}, {report.gps.lng.toFixed(6)} — Open in Maps
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 }}>Evidence</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {[
                    ["selfieUrl", "🤳 Selfie"],
                    ["addressProofUrl", "🪪 Address Proof"],
                    ["housePicUrl", "🏠 House Photo"],
                    ["landmarkPicUrl", "🏛️ Landmark"],
                    ["signatureUrl", "✍️ Signature"],
                  ].filter(([key]) => report[key]).map(([key, label]) => (
                    <a key={key} href={report[key]} target="_blank" rel="noreferrer" style={{ textAlign: "center", textDecoration: "none" }}>
                      <img
                        src={report[key]}
                        alt={label}
                        style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#f8fafc" }}
                      />
                      <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 4, fontWeight: 600 }}>{label}</div>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
