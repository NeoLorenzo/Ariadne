"use client";

import candidateStyles from "./OpportunityCandidate.module.css";

export default function OpportunityLandscapeTabs({ activeView, onChange }) {
  return (
    <div className={candidateStyles.surfaceTabs} aria-label="Opportunity Landscape views" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={activeView === "landscape"}
        className={`${candidateStyles.surfaceTab}${activeView === "landscape" ? ` ${candidateStyles.surfaceTabActive}` : ""}`}
        onClick={() => onChange("landscape")}
      >
        Landscape
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeView === "inbox"}
        className={`${candidateStyles.surfaceTab}${activeView === "inbox" ? ` ${candidateStyles.surfaceTabActive}` : ""}`}
        onClick={() => onChange("inbox")}
      >
        Review inbox
      </button>
    </div>
  );
}
