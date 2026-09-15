"use client";

import candidateStyles from "./OpportunityCandidate.module.css";

export default function OpportunityLandscapeTabs({ activeView, onChange }) {
  const tabs = [
    ["landscape", "Landscape"],
    ["applications", "Applications"],
    ["inbox", "Review inbox"]
  ];

  return (
    <div className={candidateStyles.surfaceTabs} aria-label="Opportunity Landscape views" role="tablist">
      {tabs.map(([value, label]) => <button
        key={value}
        type="button"
        role="tab"
        aria-selected={activeView === value}
        className={`${candidateStyles.surfaceTab}${activeView === value ? ` ${candidateStyles.surfaceTabActive}` : ""}`}
        onClick={() => onChange(value)}
      >
        {label}
      </button>)}
    </div>
  );
}
