"use client";

import { useEffect, useMemo, useState } from "react";
import OpportunityCandidateEditor from "./OpportunityCandidateEditor";
import OpportunityCandidateTable from "./OpportunityCandidateTable";
import OpportunityLandscapeTabs from "./OpportunityLandscapeTabs";
import {
  OPPORTUNITY_CANDIDATE_REVIEW_LABELS,
  OPPORTUNITY_CANDIDATE_REVIEW_STATUSES,
  sortOpportunityCandidates
} from "@/lib/opportunities/opportunityCandidateModel";
import {
  OPPORTUNITY_CANDIDATE_CLOUD_UNAVAILABLE,
  OPPORTUNITY_CANDIDATE_CONFLICT,
  acceptOpportunityCandidate,
  createOpportunityCandidate,
  loadOpportunityCandidatesState,
  setOpportunityCandidateReview,
  updateOpportunityCandidate
} from "@/lib/opportunities/opportunityCandidateRepository";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS } from "@/lib/opportunities/opportunityModel";
import { supabase } from "@/lib/supabase/client";
import styles from "./OpportunityLandscape.module.css";

function matchesSearch(candidate, query) {
  if (!query) return true;
  return [
    candidate.title,
    candidate.organization,
    candidate.description,
    candidate.requirements,
    candidate.sourceName,
    candidate.sourceExternalId,
    OPPORTUNITY_TYPE_LABELS[candidate.type],
    OPPORTUNITY_CANDIDATE_REVIEW_LABELS[candidate.reviewStatus]
  ].join(" ").toLowerCase().includes(query);
}

export default function OpportunityCandidateInbox({ onViewChange, onEditorOpenChange }) {
  const [candidates, setCandidates] = useState([]);
  const [userId, setUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [cloudAvailable, setCloudAvailable] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("neutral");

  const setEditorOpen = (open) => {
    setIsEditorOpen(open);
    onEditorOpenChange?.(open);
  };

  const commitLocal = (next) => setCandidates(sortOpportunityCandidates(next));

  const refresh = async (resolvedUserId = userId) => {
    const state = await loadOpportunityCandidatesState(resolvedUserId);
    setCandidates(state.candidates);
    setCloudAvailable(state.cloudAvailable);
    return state;
  };

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const local = await loadOpportunityCandidatesState("");
        if (isMounted) setCandidates(local.candidates);

        if (!supabase) {
          if (isMounted) setCloudAvailable(false);
          return;
        }

        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user?.id) {
          if (isMounted) setCloudAvailable(false);
          return;
        }

        const resolvedUserId = data.user.id;
        if (!isMounted) return;
        setUserId(resolvedUserId);
        const state = await loadOpportunityCandidatesState(resolvedUserId);
        if (!isMounted) return;
        setCandidates(state.candidates);
        setCloudAvailable(state.cloudAvailable);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void initialize();
    return () => {
      isMounted = false;
      onEditorOpenChange?.(false);
    };
  }, []);

  const filteredCandidates = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (typeFilter !== "all" && candidate.type !== typeFilter) return false;
      if (statusFilter !== "all" && candidate.reviewStatus !== statusFilter) return false;
      return matchesSearch(candidate, normalizedSearch);
    });
  }, [candidates, search, statusFilter, typeFilter]);

  const pendingCount = useMemo(
    () => candidates.filter((candidate) => candidate.reviewStatus === "pending").length,
    [candidates]
  );

  const openAdd = () => {
    setSelectedCandidate(null);
    setEditorOpen(true);
  };

  const openEdit = (candidate) => {
    setSelectedCandidate(candidate);
    setEditorOpen(true);
  };

  const finishMutation = () => {
    setEditorOpen(false);
    setSelectedCandidate(null);
  };

  const closeEditor = () => {
    if (isBusy) return;
    finishMutation();
  };

  const mutationFailure = (error, action) => {
    if (error?.message === OPPORTUNITY_CANDIDATE_CLOUD_UNAVAILABLE) {
      setCloudAvailable(false);
      setStatusTone("error");
      setStatusMessage(`${action} requires cloud access. Cached candidates are still available to read.`);
      return;
    }
    if (error?.message === OPPORTUNITY_CANDIDATE_CONFLICT) {
      setStatusTone("error");
      setStatusMessage(`${action} was not applied because the cloud candidate changed. Reload and review the latest copy.`);
      return;
    }
    setStatusTone("error");
    setStatusMessage(`${action} could not be completed.`);
  };

  const saveCandidate = async (form) => {
    if (!userId) {
      mutationFailure(new Error(OPPORTUNITY_CANDIDATE_CLOUD_UNAVAILABLE), "Saving this candidate");
      return false;
    }

    setIsBusy(true);
    setStatusMessage("");
    try {
      if (selectedCandidate?.id) {
        await updateOpportunityCandidate({ candidateId: selectedCandidate.id, patch: form, userId, onLocalUpdate: commitLocal });
      } else {
        await createOpportunityCandidate({
          candidate: { ...form, sourceType: "manual", sourceName: "Manual", reviewStatus: "pending" },
          userId,
          onLocalUpdate: commitLocal
        });
      }
      setCloudAvailable(true);
      setStatusTone("neutral");
      setStatusMessage(selectedCandidate?.id ? "Candidate updated." : "Candidate added to the review inbox.");
      finishMutation();
      return true;
    } catch (error) {
      mutationFailure(error, selectedCandidate?.id ? "Updating this candidate" : "Adding this candidate");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const acceptCandidate = async (form) => {
    if (!userId || !selectedCandidate?.id) return false;
    setIsBusy(true);
    setStatusMessage("");
    try {
      const result = await acceptOpportunityCandidate({
        candidateId: selectedCandidate.id,
        candidatePatch: form,
        userId,
        onLocalUpdate: commitLocal
      });
      setCloudAvailable(true);
      setStatusTone("neutral");
      setStatusMessage(`Accepted “${result.opportunity.title}” into Opportunity Landscape.`);
      finishMutation();
      return true;
    } catch (error) {
      mutationFailure(error, "Accepting this candidate");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const reviewCandidate = async (reviewStatus, rejectionReason) => {
    if (!userId || !selectedCandidate?.id) return false;
    setIsBusy(true);
    setStatusMessage("");
    try {
      await setOpportunityCandidateReview({
        candidateId: selectedCandidate.id,
        reviewStatus,
        rejectionReason,
        userId,
        onLocalUpdate: commitLocal
      });
      setCloudAvailable(true);
      setStatusTone("neutral");
      setStatusMessage(reviewStatus === "duplicate" ? "Candidate marked as duplicate." : "Candidate rejected.");
      finishMutation();
      return true;
    } catch (error) {
      mutationFailure(error, "Reviewing this candidate");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const retryCloud = async () => {
    if (!userId || isBusy) return;
    setIsBusy(true);
    try {
      const state = await refresh(userId);
      setStatusTone(state.cloudAvailable ? "neutral" : "error");
      setStatusMessage(state.cloudAvailable ? "Candidate inbox refreshed." : "Cloud is still unavailable. Showing cached candidates.");
    } finally {
      setIsBusy(false);
    }
  };

  const hasFilters = Boolean(search.trim()) || typeFilter !== "all" || statusFilter !== "pending";
  const emptyMessage = candidates.length === 0
    ? "No candidates yet. Automated sources will arrive here for review; you can also add a manual candidate."
    : hasFilters
      ? "No candidates match these filters."
      : "No pending candidates.";

  return (
    <>
      <section className={styles.workspace}>
        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <div className={styles.headingGroup}>
              <h2 className={styles.title}>Opportunity Landscape</h2>
              <span className={styles.count}>{filteredCandidates.length}</span>
              <span className={`${styles.syncBadge}${cloudAvailable ? "" : ` ${styles.syncConflict}`}`}>
                {cloudAvailable ? `${pendingCount} pending` : "Cached / offline"}
              </span>
            </div>
            <span className={styles.toolbarSpacer} />
            <button type="button" className={styles.addButton} onClick={openAdd} aria-label="Add candidate" title="Add candidate">+</button>
          </div>

          <OpportunityLandscapeTabs activeView="inbox" onChange={onViewChange} />

          <div className={styles.filters}>
            <input type="search" className={styles.control} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidates…" aria-label="Search candidates" />
            <select className={styles.control} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter candidate type">
              <option value="all">All types</option>
              {OPPORTUNITY_TYPES.map((type) => <option key={type} value={type}>{OPPORTUNITY_TYPE_LABELS[type]}</option>)}
            </select>
            <select className={styles.control} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter review status">
              <option value="all">All statuses</option>
              {OPPORTUNITY_CANDIDATE_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{OPPORTUNITY_CANDIDATE_REVIEW_LABELS[status]}</option>)}
            </select>
          </div>

          {!cloudAvailable || statusMessage ? (
            <div className={`${styles.statusBar}${statusTone === "error" || !cloudAvailable ? ` ${styles.statusBarError}` : ""}`} role="status">
              <span>{statusMessage || "Cloud unavailable. Cached candidates are readable; review changes are disabled until reconnection."}</span>
              {!cloudAvailable ? <button type="button" className={styles.retryButton} onClick={retryCloud} disabled={isBusy}>Retry</button> : null}
            </div>
          ) : null}

          <div className={styles.content}>
            {isLoading && candidates.length === 0 ? (
              <div className={styles.empty}>Loading candidate inbox…</div>
            ) : filteredCandidates.length === 0 ? (
              <div className={styles.empty}>{emptyMessage}</div>
            ) : (
              <OpportunityCandidateTable candidates={filteredCandidates} onSelect={openEdit} />
            )}
          </div>
        </section>
      </section>

      <OpportunityCandidateEditor
        isOpen={isEditorOpen}
        candidate={selectedCandidate}
        isBusy={isBusy}
        onClose={closeEditor}
        onSave={saveCandidate}
        onAccept={acceptCandidate}
        onReview={reviewCandidate}
      />
    </>
  );
}
