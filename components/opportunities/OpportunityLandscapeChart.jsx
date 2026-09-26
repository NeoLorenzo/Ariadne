"use client";

import { OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD } from "@/lib/opportunities/opportunityLandscapeScore";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import styles from "./OpportunityLandscapeChart.module.css";

function pointLabel(point) {
  const organization = point.opportunity.organization ? ` · ${point.opportunity.organization}` : "";
  return `${point.opportunity.title}${organization} — Strategic value ${point.strategicValue}, attainability ${point.attainability}`;
}

function OpportunityPoint({ cx, cy, payload, onSelect }) {
  if (!payload || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const archivedClass = payload.opportunity.archived ? ` ${styles.pointArchived}` : "";

  return (
    <g
      className={`${styles.pointGroup}${archivedClass}`}
      role="button"
      tabIndex="0"
      aria-label={pointLabel(payload)}
      onClick={() => onSelect?.(payload.opportunity)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(payload.opportunity);
        }
      }}
    >
      <circle className={styles.pointHalo} cx={cx} cy={cy} r="13" />
      <circle className={styles.point} cx={cx} cy={cy} r="6.5" />
      <title>{pointLabel(payload)}</title>
    </g>
  );
}

const V2_DIMENSION_LABELS = [
  ["capabilityMatch", "Capability"],
  ["relevantExperience", "Experience"],
  ["evidenceStrength", "Evidence"],
  ["domainFit", "Domain"],
  ["competitiveBarFit", "Competitive bar"],
  ["differentiation", "Differentiation"]
];

function OpportunityTooltip({ active, payload }) {
  const point = payload?.[0]?.payload;
  if (!active || !point?.opportunity) return null;
  const isV2 = point.score.methodologyVersion === "2";

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{point.opportunity.title}</div>
      {point.opportunity.organization ? <div className={styles.tooltipOrganization}>{point.opportunity.organization}</div> : null}
      <div className={styles.tooltipScores}>
        <span><strong>{point.strategicValue}</strong> Strategic value</span>
        <span><strong>{point.attainability}</strong> Attainability</span>
        {isV2 && Number.isFinite(point.score.competitiveStrength) ? <span><strong>{point.score.competitiveStrength}</strong> Competitive strength</span> : null}
      </div>
      {isV2 ? <div className={styles.tooltipNote}>
        Eligibility {point.score.eligibility}/4 × {point.score.eligibilityMultiplier} multiplier
      </div> : null}
      {isV2 ? <div className={styles.tooltipNote}>
        {V2_DIMENSION_LABELS.map(([key, label]) => `${label} ${point.score[key]}/4`).join(" · ")}
      </div> : null}
      {point.score.strategicValueRationale ? <div className={styles.tooltipNote}>{point.score.strategicValueRationale}</div> : null}
      {point.score.attainabilityRationale ? <div className={styles.tooltipNote}>{point.score.attainabilityRationale}</div> : null}
      <div className={styles.tooltipNote}>{isV2 ? "Attainability v2 · eligibility-constrained competitive strength" : "Legacy Attainability v1"} · Methodology v{point.score.methodologyVersion}</div>
    </div>
  );
}

const axisTick = { fill: "#6b6b72", fontSize: 11, fontWeight: 500 };
const axisLine = { stroke: "#27272a" };
const quadrantLabel = (value, fill = "rgba(160, 160, 160, 0.5)") => ({ value, position: "insideTopLeft", fill, fontSize: 10, fontWeight: 600, letterSpacing: "0.12em" });

export default function OpportunityLandscapeChart({ opportunities = [], scoresByOpportunity = {}, onSelect }) {
  const points = opportunities
    .map((opportunity) => {
      const score = scoresByOpportunity[opportunity.id];
      if (!score || !Number.isFinite(score.strategicValue) || !Number.isFinite(score.attainability)) return null;
      return {
        opportunity,
        score,
        strategicValue: score.strategicValue,
        attainability: score.attainability
      };
    })
    .filter(Boolean);

  const unscoredCount = opportunities.length - points.length;
  if (!opportunities.length) return null;

  return (
    <section className={styles.section} aria-labelledby="opportunity-map-title">
      <div className={styles.header}>
        <div>
          <h3 id="opportunity-map-title" className={styles.title}>Opportunity map</h3>
          <p className={styles.description}>
            Canonical Strategic Value and Attainability scores. High-value/high-attainability begins at {OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD}; Attainability v2 constrains competitive strength by formal eligibility.
          </p>
        </div>
        <span className={styles.prototypeBadge}>{unscoredCount ? `${unscoredCount} unscored` : "Fully scored"}</span>
      </div>

      {points.length ? (
        <div className={styles.chartFrame}>
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 24, right: 28, bottom: 42, left: 18 }}>
                <CartesianGrid stroke="#161618" vertical horizontal />

                <ReferenceArea
                  x1={0}
                  x2={OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD}
                  y1={OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD}
                  y2={100}
                  fill="rgba(255, 255, 255, 0.012)"
                  stroke="none"
                  label={quadrantLabel("ACCESSIBLE / LOWER VALUE")}
                />
                <ReferenceArea
                  x1={OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD}
                  x2={100}
                  y1={OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD}
                  y2={100}
                  fill="rgba(0, 136, 255, 0.07)"
                  stroke="none"
                  label={quadrantLabel("PRIME OPPORTUNITIES", "rgba(77, 171, 255, 0.85)")}
                />
                <ReferenceArea
                  x1={0}
                  x2={OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD}
                  y1={0}
                  y2={OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD}
                  fill="rgba(255, 255, 255, 0)"
                  stroke="none"
                  label={quadrantLabel("BACKGROUND", "rgba(160, 160, 160, 0.35)")}
                />
                <ReferenceArea
                  x1={OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD}
                  x2={100}
                  y1={0}
                  y2={OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD}
                  fill="rgba(0, 136, 255, 0.02)"
                  stroke="none"
                  label={quadrantLabel("BUILD TOWARD")}
                />

                <ReferenceLine x={OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD} stroke="#3f3f46" strokeDasharray="4 6" />
                <ReferenceLine y={OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD} stroke="#3f3f46" strokeDasharray="4 6" />

                <XAxis
                  type="number"
                  dataKey="strategicValue"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={axisLine}
                  label={{ value: "Strategic value", position: "insideBottom", offset: -28, fill: "#a0a0a0", fontSize: 12, fontWeight: 550 }}
                />
                <YAxis
                  type="number"
                  dataKey="attainability"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={axisLine}
                  width={52}
                  label={{ value: "Attainability", angle: -90, position: "insideLeft", fill: "#a0a0a0", fontSize: 12, fontWeight: 550 }}
                />

                <Tooltip
                  cursor={{ stroke: "rgba(0, 136, 255, 0.3)", strokeDasharray: "3 4" }}
                  content={<OpportunityTooltip />}
                />

                <Scatter
                  data={points}
                  isAnimationActive={false}
                  shape={(props) => <OpportunityPoint {...props} onSelect={onSelect} />}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className={styles.chartFrame}>
          <div className={styles.emptyChart}>Run the Opportunity Review Agent to score the current Landscape.</div>
        </div>
      )}

      <div className={styles.footer}>
        <span>{points.length} of {opportunities.length} opportunit{opportunities.length === 1 ? "y" : "ies"} plotted</span>
        <span>Click a point to open its record.</span>
      </div>
    </section>
  );
}
