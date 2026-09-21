"use client";

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

function hashString(value) {
  let hash = 2166136261;
  const input = String(value || "");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function placeholderScore(opportunity, axis) {
  const identity = [opportunity.id, opportunity.title, opportunity.organization].filter(Boolean).join("|");
  return 10 + (hashString(`${axis}:${identity}`) % 81);
}

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

function OpportunityTooltip({ active, payload }) {
  const point = payload?.[0]?.payload;
  if (!active || !point?.opportunity) return null;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{point.opportunity.title}</div>
      {point.opportunity.organization ? <div className={styles.tooltipOrganization}>{point.opportunity.organization}</div> : null}
      <div className={styles.tooltipScores}>
        <span><strong>{point.strategicValue}</strong> Strategic value</span>
        <span><strong>{point.attainability}</strong> Attainability</span>
      </div>
      <div className={styles.tooltipNote}>Temporary prototype scores</div>
    </div>
  );
}

const axisTick = { fill: "#64748b", fontSize: 12, fontWeight: 600 };
const axisLine = { stroke: "rgba(100, 116, 139, 0.4)" };

export default function OpportunityLandscapeChart({ opportunities = [], onSelect }) {
  const points = opportunities.map((opportunity) => ({
    opportunity,
    strategicValue: placeholderScore(opportunity, "strategic-value"),
    attainability: placeholderScore(opportunity, "attainability")
  }));

  if (!points.length) return null;

  return (
    <section className={styles.section} aria-labelledby="opportunity-map-title">
      <div className={styles.header}>
        <div>
          <h3 id="opportunity-map-title" className={styles.title}>Opportunity map</h3>
          <p className={styles.description}>
            All Landscape opportunities plotted with temporary placeholder scores.
          </p>
        </div>
        <span className={styles.prototypeBadge}>Prototype positions</span>
      </div>

      <div className={styles.chartFrame}>
        <div className={styles.chart}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 24, right: 28, bottom: 42, left: 18 }}>
              <CartesianGrid stroke="rgba(100, 116, 139, 0.16)" vertical horizontal />

              <ReferenceArea
                x1={0}
                x2={50}
                y1={50}
                y2={100}
                fill="rgba(148, 163, 184, 0.02)"
                stroke="none"
                label={{ value: "ACCESSIBLE / LOWER VALUE", position: "insideTopLeft", fill: "rgba(148, 163, 184, 0.46)", fontSize: 11 }}
              />
              <ReferenceArea
                x1={50}
                x2={100}
                y1={50}
                y2={100}
                fill="rgba(0, 136, 255, 0.075)"
                stroke="none"
                label={{ value: "PRIME OPPORTUNITIES", position: "insideTopLeft", fill: "rgba(0, 136, 255, 0.64)", fontSize: 11 }}
              />
              <ReferenceArea
                x1={0}
                x2={50}
                y1={0}
                y2={50}
                fill="rgba(148, 163, 184, 0.01)"
                stroke="none"
                label={{ value: "BACKGROUND", position: "insideTopLeft", fill: "rgba(148, 163, 184, 0.4)", fontSize: 11 }}
              />
              <ReferenceArea
                x1={50}
                x2={100}
                y1={0}
                y2={50}
                fill="rgba(0, 136, 255, 0.025)"
                stroke="none"
                label={{ value: "BUILD TOWARD", position: "insideTopLeft", fill: "rgba(148, 163, 184, 0.46)", fontSize: 11 }}
              />

              <ReferenceLine x={50} stroke="rgba(148, 163, 184, 0.34)" strokeDasharray="5 6" />
              <ReferenceLine y={50} stroke="rgba(148, 163, 184, 0.34)" strokeDasharray="5 6" />

              <XAxis
                type="number"
                dataKey="strategicValue"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={axisTick}
                tickLine={false}
                axisLine={axisLine}
                label={{ value: "Strategic value", position: "insideBottom", offset: -28, fill: "#94a3b8", fontSize: 13, fontWeight: 700 }}
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
                label={{ value: "Attainability", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 13, fontWeight: 700 }}
              />

              <Tooltip
                cursor={{ stroke: "rgba(0, 136, 255, 0.26)", strokeDasharray: "3 4" }}
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

      <div className={styles.footer}>
        <span>{points.length} opportunit{points.length === 1 ? "y" : "ies"}</span>
        <span>Click a point to open its record.</span>
      </div>
    </section>
  );
}
