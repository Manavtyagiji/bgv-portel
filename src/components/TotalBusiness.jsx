// src/components/TotalBusiness.jsx
// Super-admin-only. Overall business, this month's business, and profit
// (client revenue − vendor payable, after penalty), plus a monthly trend
// chart. Reuses the exact same pricing/penalty/month calculation helpers
// CostSummary.jsx already uses (imported, not reimplemented) so the
// numbers here are guaranteed consistent with Cost Summary — this is a
// different view over the same underlying math, not a second, possibly
// diverging calculation.
import { useState, useEffect } from "react";
import {
  fmt, getCol, flattenRow, isClosedRow, getCasePrice, getPenaltyInfo,
  parseMonth, monthSortKey, getWorkspaceId,
} from "./CostSummary.jsx";
import { pricingAPI, uploadAPI } from "../api/api";
import { idbGet, idbSet } from "../utils/idbCache";

const MASTER = "__MASTER_TABLE__";
const BUSINESS_COLOR = "#10b981"; // same green CostSummary already uses for client revenue
const PROFIT_COLOR = "#7c3aed";   // validated pair — see dataviz skill palette check

// Aggregates ONE batch of rows into the running accumulator (accMap: month
// -> {business, vendorCost}, acc: {overallBusiness, overallVendorCost}) —
// each row's pricing is computed exactly once, no matter how many batches
// arrive, instead of re-deriving totals from scratch over the whole
// accumulated row set on every batch (which was the actual slow part —
// not the fetch itself, but redoing the same rule-matching math for
// already-processed rows over and over as more batches landed).
function aggregateBatch(rowsBatch, pricingRules, accMap, acc) {
  rowsBatch.forEach(raw => {
    const row = flattenRow(raw);
    if (!isClosedRow(row)) return;

    const clientPrice = getCasePrice(row, "client", pricingRules, {});
    const vendorPrice = getCasePrice(row, "vendor", pricingRules, {});
    const penalty = getPenaltyInfo(row, vendorPrice, "vendor");
    const finalVendorCost = penalty.finalAmount;

    acc.overallBusiness += clientPrice;
    acc.overallVendorCost += finalVendorCost;

    const month = parseMonth(getCol(row, "Month") || getCol(row, "month") || "", row);
    const key = month || "Unknown";
    if (!accMap.has(key)) accMap.set(key, { business: 0, vendorCost: 0 });
    const bucket = accMap.get(key);
    bucket.business += clientPrice;
    bucket.vendorCost += finalVendorCost;
  });
}

function snapshotMonthly(accMap, acc) {
  const months = Array.from(accMap.entries())
    .filter(([m]) => m !== "Unknown")
    .map(([month, v]) => ({ month, business: v.business, vendorCost: v.vendorCost, profit: v.business - v.vendorCost }))
    .sort((a, b) => monthSortKey(a.month) - monthSortKey(b.month));
  return {
    months,
    overallBusiness: acc.overallBusiness,
    overallVendorCost: acc.overallVendorCost,
    overallProfit: acc.overallBusiness - acc.overallVendorCost,
  };
}

const EMPTY_MONTHLY = { months: [], overallBusiness: 0, overallVendorCost: 0, overallProfit: 0 };

export default function TotalBusiness() {
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState(EMPTY_MONTHLY);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [chartType, setChartType] = useState("bar"); // "bar" | "line"

  // Deliberately the SAME cache key + shape as CostSummary.jsx — both pages
  // fetch the identical underlying dataset (every closed record), so
  // sharing one cache means whichever page you open first "warms" the
  // other: reopening either becomes an instant cached paint instead of
  // each page redundantly re-fetching thousands of records on its own
  // first visit.
  const cacheKey = `bgv_cost_summary_cache_${getWorkspaceId()}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Pricing rules first, and awaited — every price calculation below
      // depends on this being the real ruleset, not the empty default, so
      // nothing gets computed (cached instant-paint or live fetch) until
      // it's actually loaded. This request is small and fast; it's the
      // records fetch that's expensive, not this.
      let pricingRules = {};
      try {
        const data = await pricingAPI.getAll();
        if (data && typeof data === "object") pricingRules = data;
      } catch (_) { /* fall back to {} — same as before */ }
      if (cancelled) return;

      const cached = await idbGet(cacheKey);
      if (cancelled) return;
      if (cached && typeof cached === "object" && Array.isArray(cached[MASTER]) && cached[MASTER].length > 0) {
        const accMap = new Map();
        const acc = { overallBusiness: 0, overallVendorCost: 0 };
        aggregateBatch(cached[MASTER], pricingRules, accMap, acc);
        setMonthly(snapshotMonthly(accMap, acc));
        setLoading(false);
      }

      const BATCH_SIZE = 1000;
      let pageNo = 1;
      let allRows = [];
      let firstPaintDone = false;
      const accMap = new Map();
      const acc = { overallBusiness: 0, overallVendorCost: 0 };
      try {
        while (true) {
          if (cancelled) return;
          const batch = await uploadAPI.getRecords({ status: "closed", page: pageNo, limit: BATCH_SIZE });
          if (cancelled) return;
          if (!Array.isArray(batch) || batch.length === 0) break;
          allRows = allRows.concat(batch);
          aggregateBatch(batch, pricingRules, accMap, acc); // only the NEW batch, not the whole set again
          setMonthly(snapshotMonthly(accMap, acc));
          if (!firstPaintDone) { setLoading(false); firstPaintDone = true; }
          if (batch.length < BATCH_SIZE) break;
          pageNo += 1;
        }
        if (allRows.length > 0) {
          const grouped = {};
          allRows.forEach(row => {
            const clientName = String(row["Company Name"] || row["Client Name"] || "Unknown").trim() || "Unknown";
            if (!grouped[clientName]) grouped[clientName] = [];
            grouped[clientName].push(row);
          });
          grouped[MASTER] = allRows;
          idbSet(cacheKey, grouped);
        }
      } catch (err) {
        console.warn("Total Business fetch failed:", err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentMonthLabel = new Date().toLocaleString("en-IN", { month: "short", year: "numeric" });
  const thisMonth = monthly.months.find(m => m.month === currentMonthLabel);
  const thisMonthBusiness = thisMonth ? thisMonth.business : 0;

  // Last 12 months for the chart (or fewer if less data exists) — keeps the
  // chart readable instead of cramming a multi-year history into one row.
  const chartMonths = monthly.months.slice(-12);
  const maxValue = Math.max(1, ...chartMonths.map(m => Math.max(m.business, m.profit, 0)));

  return (
    <div style={{ padding: "24px 24px 32px", display: "flex", flexDirection: "column", gap: 22, fontFamily: "var(--head)" }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>💼 Total Business</div>
        <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>
          Overall and monthly business, and profit (client revenue − vendor payable, after penalty) — closed cases only.
          {loading && " Loading…"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard label="Overall Business" value={fmt(monthly.overallBusiness)} color={BUSINESS_COLOR} icon="💰" />
        <StatCard label={`This Month (${currentMonthLabel})`} value={fmt(thisMonthBusiness)} color={BUSINESS_COLOR} icon="📅" />
        <StatCard label="Overall Profit" value={fmt(monthly.overallProfit)} color={PROFIT_COLOR} icon="📈" />
      </div>

      <div style={{
        background: "var(--card)", border: "1.5px solid var(--border2)", borderRadius: "var(--r16)",
        padding: "20px 24px", boxShadow: "var(--shadow)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Monthly Business &amp; Profit</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text3)" }}>
              <LegendDot color={BUSINESS_COLOR} label="Business" />
              <LegendDot color={PROFIT_COLOR} label="Profit" />
            </div>
            <div style={{
              display: "inline-flex", background: "rgba(37,99,235,0.06)",
              border: "1.5px solid rgba(37,99,235,0.18)", borderRadius: 10, overflow: "hidden",
            }}>
              {["bar", "line"].map(t => (
                <button
                  key={t}
                  onClick={() => setChartType(t)}
                  style={{
                    border: "none", cursor: "pointer", padding: "7px 16px",
                    fontFamily: "var(--head)", fontSize: 12, fontWeight: 600,
                    background: chartType === t ? "linear-gradient(135deg,#2563eb,#06b6d4)" : "transparent",
                    color: chartType === t ? "#fff" : "var(--text3)",
                  }}
                >
                  {t === "bar" ? "▤ Bar" : "📈 Line"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chartMonths.length === 0 && !loading && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
            No closed cases with a completed date yet.
          </div>
        )}

        {chartMonths.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <svg
              width={Math.max(560, chartMonths.length * 70)}
              height={280}
              role="img"
              aria-label="Monthly business and profit chart"
            >
              {[0, 0.25, 0.5, 0.75, 1].map(t => (
                <line
                  key={t}
                  x1={40} x2={Math.max(560, chartMonths.length * 70) - 10}
                  y1={220 - t * 180} y2={220 - t * 180}
                  stroke="var(--border2)" strokeWidth={1} opacity={0.5}
                />
              ))}
              {chartType === "bar" && chartMonths.map((m, i) => {
                const groupX = 50 + i * 70;
                const bw = 22;
                const bh1 = Math.max(2, (m.business / maxValue) * 180);
                const bh2 = Math.max(2, (Math.max(m.profit, 0) / maxValue) * 180);
                const isHover = hoverIdx === i;
                return (
                  <g
                    key={m.month}
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                    style={{ cursor: "default" }}
                  >
                    <rect x={groupX} y={220 - bh1} width={bw} height={bh1} rx={4}
                      fill={BUSINESS_COLOR} opacity={isHover ? 1 : 0.85} />
                    <rect x={groupX + bw + 4} y={220 - bh2} width={bw} height={bh2} rx={4}
                      fill={PROFIT_COLOR} opacity={isHover ? 1 : 0.85} />
                    <title>{`${m.month}\nBusiness: ${fmt(m.business)}\nProfit: ${fmt(m.profit)}`}</title>
                    {isHover && (
                      <text x={groupX + bw + 2} y={Math.min(220 - bh1, 220 - bh2) - 8}
                        textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--text)">
                        {fmt(m.business)}
                      </text>
                    )}
                    <text x={groupX + bw + 2} y={236} textAnchor="middle" fontSize={11} fill="var(--text3)">
                      {m.month.split(" ")[0]}
                    </text>
                  </g>
                );
              })}

              {chartType === "line" && (() => {
                const cx = (i) => 50 + i * 70 + 24;
                const yFor = (v) => 220 - (Math.max(v, 0) / maxValue) * 180;
                const businessPts = chartMonths.map((m, i) => `${cx(i)},${yFor(m.business)}`).join(" ");
                const profitPts = chartMonths.map((m, i) => `${cx(i)},${yFor(m.profit)}`).join(" ");
                return (
                  <>
                    <polyline points={businessPts} fill="none" stroke={BUSINESS_COLOR} strokeWidth={2} />
                    <polyline points={profitPts} fill="none" stroke={PROFIT_COLOR} strokeWidth={2} />
                    {chartMonths.map((m, i) => {
                      const isHover = hoverIdx === i;
                      const yB = yFor(m.business);
                      const yP = yFor(m.profit);
                      return (
                        <g
                          key={m.month}
                          onMouseEnter={() => setHoverIdx(i)}
                          onMouseLeave={() => setHoverIdx(null)}
                          style={{ cursor: "default" }}
                        >
                          <rect x={cx(i) - 12} y={0} width={24} height={236} fill="transparent" />
                          <circle cx={cx(i)} cy={yB} r={isHover ? 6 : 4} fill={BUSINESS_COLOR} />
                          <circle cx={cx(i)} cy={yP} r={isHover ? 6 : 4} fill={PROFIT_COLOR} />
                          <title>{`${m.month}\nBusiness: ${fmt(m.business)}\nProfit: ${fmt(m.profit)}`}</title>
                          {isHover && (
                            <text x={cx(i)} y={Math.min(yB, yP) - 10}
                              textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--text)">
                              {fmt(m.business)}
                            </text>
                          )}
                          <text x={cx(i)} y={236} textAnchor="middle" fontSize={11} fill="var(--text3)">
                            {m.month.split(" ")[0]}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        )}
      </div>

      {/* Table view — same data as the chart, for accessibility / precise reading */}
      {chartMonths.length > 0 && (
        <div style={{
          background: "var(--card)", border: "1.5px solid var(--border2)", borderRadius: "var(--r16)",
          overflow: "hidden", boxShadow: "var(--shadow)",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg,#1d4ed8,#0891b2)" }}>
                <th style={thStyle}>Month</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Business</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Vendor Cost</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {chartMonths.map(m => (
                <tr key={m.month} style={{ borderBottom: "1px solid var(--border2)" }}>
                  <td style={tdStyle}>{m.month}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: BUSINESS_COLOR, fontWeight: 700 }}>{fmt(m.business)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(m.vendorCost)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: PROFIT_COLOR, fontWeight: 700 }}>{fmt(m.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      flex: 1, minWidth: 200, background: "var(--card)", border: "1.5px solid var(--border2)",
      borderRadius: "var(--r16)", padding: "18px 20px", boxShadow: "var(--shadow)",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, background: `${color}1f`, border: `1px solid ${color}40`, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)" }}>
          {label}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

const thStyle = {
  padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.85)",
};
const tdStyle = { padding: "11px 16px", fontSize: 13, color: "var(--text)" };
