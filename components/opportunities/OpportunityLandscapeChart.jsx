"use client";

import styles from "./OpportunityLandscapeChart.module.css";

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 560;
const PLOT = { left: 74, right: 30, top: 34, bottom: 70 };
const PLOT_WIDTH = VIEW_WIDTH - PLOT.left - PLOT.right;
const PLOT_HEIGHT = VIEW_HEIGHT - PLOT.top - PLOT.bottom;
const GRID_VALUES = [0, 25, 50, 75, 100];

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

function toX(value) {
  return PLOT.left + (value / 100) * PLOT_WIDTH;
}

function toY(value) {
  return PLOT.top + ((100 - value) / 100) * PLOT_HEIGHT;
}

function pointLabel(point) {
  const organization = point.opportunity.organization ? ` · ${point.opportunity.organization}` : "";
  return `${point.opportunity.title}${organization} — Strategic value ${point.strategicValue}, attainability ${point.attainability}`;
}

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
        <svg
          className={styles.chart}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          role="img"
          aria-label="Scatter plot of opportunity strategic value against attainability"
        >
          <rect className={styles.quadrantBackground} x={PLOT.left} y={PLOT.top} width={PLOT_WIDTH} height={PLOT_HEIGHT} rx="12" />
          <rect className={styles.quadrantPrime} x={toX(50)} y={PLOT.top} width={PLOT_WIDTH / 2} height={PLOT_HEIGHT / 2} />
          <rect className={styles.quadrantBuild} x={toX(50)} y={toY(50)} width={PLOT_WIDTH / 2} height={PLOT_HEIGHT / 2} />
          <rect className={styles.quadrantAccessible} x={PLOT.left} y={PLOT.top} width={PLOT_WIDTH / 2} height={PLOT_HEIGHT / 2} />

          {GRID_VALUES.map((value) => (
            <g key={`grid-${value}`}>
              <line className={value === 50 ? styles.midline : styles.gridLine} x1={toX(value)} x2={toX(value)} y1={PLOT.top} y2={PLOT.top + PLOT_HEIGHT} />
              <line className={value === 50 ? styles.midline : styles.gridLine} x1={PLOT.left} x2={PLOT.left + PLOT_WIDTH} y1={toY(value)} y2={toY(value)} />
              <text className={styles.tickLabel} x={toX(value)} y={PLOT.top + PLOT_HEIGHT + 24} textAnchor="middle">{value}</text>
              <text className={styles.tickLabel} x={PLOT.left - 16} y={toY(value)} textAnchor="end" dominantBaseline="middle">{value}</text>
            </g>
          ))}

          <text className={styles.quadrantLabel} x={PLOT.left + 18} y={PLOT.top + 26}>ACCESSIBLE / LOWER VALUE</text>
          <text className={styles.quadrantLabelStrong} x={toX(50) + 18} y={PLOT.top + 26}>PRIME OPPORTUNITIES</text>
          <text className={styles.quadrantLabel} x={PLOT.left + 18} y={toY(50) + 28}>BACKGROUND</text>
          <text className={styles.quadrantLabel} x={toX(50) + 18} y={toY(50) + 28}>BUILD TOWARD</text>

          <text className={styles.axisLabel} x={PLOT.left + PLOT_WIDTH / 2} y={VIEW_HEIGHT - 16} textAnchor="middle">
            Strategic value
          </text>
          <text
            className={styles.axisLabel}
            x="18"
            y={PLOT.top + PLOT_HEIGHT / 2}
            textAnchor="middle"
            transform={`rotate(-90 18 ${PLOT.top + PLOT_HEIGHT / 2})`}
          >
            Attainability
          </text>

          {points.map((point) => {
            const x = toX(point.strategicValue);
            const y = toY(point.attainability);
            return (
              <g
                key={point.opportunity.id}
                className={point.opportunity.archived ? `${styles.pointGroup} ${styles.pointArchived}` : styles.pointGroup}
                role="button"
                tabIndex="0"
                aria-label={pointLabel(point)}
                onClick={() => onSelect?.(point.opportunity)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect?.(point.opportunity);
                  }
                }}
              >
                <circle className={styles.pointHalo} cx={x} cy={y} r="13" />
                <circle className={styles.point} cx={x} cy={y} r="6.5" />
                <title>{pointLabel(point)}</title>
              </g>
            );
          })}
        </svg>
      </div>

      <div className={styles.footer}>
        <span>{points.length} opportunit{points.length === 1 ? "y" : "ies"}</span>
        <span>Click a point to open its record.</span>
      </div>
    </section>
  );
}
