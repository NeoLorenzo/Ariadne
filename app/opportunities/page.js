"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import OpportunityEditor from "@/components/opportunities/OpportunityEditor";
import OpportunityTable from "@/components/opportunities/OpportunityTable";
import {
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  sortOpportunitiesByDeadline
} from "@/lib/opportunities/opportunityModel";
import {
  OPPORTUNITY_SYNC_CONFLICT,
  OPPORTUNITY_SYNC_PENDING,
  createOpportunity,
  deleteOpportunity,
  flushOpportunityOperations,
  getOpportunitySyncState,
  loadOpportunities,
  setOpportunityArchived,
  updateOpportunity
} from "@/lib/opportunities/opportunityRepository";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/opportunities/OpportunityLandscape.module.css";

const EMPTY_SYNC_STATE = { pendingCount: 0, conflictCount: 0, operations: [] };

function matchesSearch(opportunity, query) {
  if (!query) return true;
  const haystack = [
    opportunity.title,
    opportunity.organization,
    opportunity.description,
    opportunity.requirements,
    OPPORTUNITY_TYPE_LABELS[opportunity.type]
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState([]);
  const [userId, setUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [lifecycleFilter, setLifecycleFilter] = useState("active");
  const [syncState, setSyncState] = useState(EMPTY_SYNC_STATE);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("neutral");

  const commitLocal = (next) => {
    setOpportunities(sortOpportunitiesByDeadline(next));
  };

  const refreshSyncState = (resolvedUserId = userId) => {
    setSyncState(resolvedUserId ? getOpportunitySyncState(resolvedUserId) : EMPTY_SYNC_STATE);
  };

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const local = await loadOpportunities("");
        if (isMounted) setOpportunities(local);

        if (!supabase) return;
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user?.id) return;

        const resolvedUserId = data.user.id;
        if (!isMounted) return;
        setUserId(resolvedUserId);

        const loaded = await loadOpportunities(resolvedUserId);
        if (!isMounted) return;
        setOpportunities(loaded);
        setSyncState(getOpportunitySyncState(resolvedUserId));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void initialize();
    return () => { isMounted = false; };
  }, []);

  const filteredOpportunities = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return opportunities.filter((opportunity) => {
      if (typeFilter !== "all" && opportunity.type !== typeFilter) return false;
      if (lifecycleFilter === "active" && opportunity.archived) return false;
      if (lifecycleFilter === "archived" && !opportunity.archived) return false;
      return matchesSearch(opportunity, normalizedSearch);
    });
  }, [lifecycleFilter, opportunities, search, typeFilter]);

  const syncBadge = useMemo(() => {
    if (syncState.conflictCount > 0) {
      return {
        label: `${syncState.conflictCount} conflict${syncState.conflictCount === 1 ? "" : "s"}`,
        className: `${styles.syncBadge} ${styles.syncConflict}`
      };
    }
    if (syncState.pendingCount > 0) {
      return {
        label: `${syncState.pendingCount} pending`,
        className: `${styles.syncBadge} ${styles.syncPending}`
      };
    }
    return { label: isLoading ? "Loading" : "Synced", className: styles.syncBadge };
  }, [isLoading, syncState.conflictCount, syncState.pendingCount]);

  const openAdd = () => {
    setSelectedOpportunity(null);
    setIsEditorOpen(true);
  };

  const openEdit = (opportunity) => {
    setSelectedOpportunity(opportunity);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    if (isBusy) return;
    setIsEditorOpen(false);
    setSelectedOpportunity(null);
  };

  const handleSyncError = (error, actionLabel) => {
    refreshSyncState();
    if (error?.message === OPPORTUNITY_SYNC_PENDING) {
      setStatusTone("warning");
      setStatusMessage(`${actionLabel} saved locally. Cloud synchronization is pending.`);
      return true;
    }
    if (error?.message === OPPORTUNITY_SYNC_CONFLICT) {
      setStatusTone("error");
      setStatusMessage(`${actionLabel} saved locally, but the cloud copy changed. The local version has been preserved.`);
      return true;
    }
    setStatusTone("error");
    setStatusMessage(`${actionLabel} could not be completed.`);
    return false;
  };

  const finishAcceptedMutation = () => {
    setIsEditorOpen(false);
    setSelectedOpportunity(null);
    refreshSyncState();
  };

  const saveOpportunity = async (form) => {
    if (!userId) {
      setStatusTone("error");
      setStatusMessage("Secure account state is not ready yet.");
      return false;
    }

    setIsBusy(true);
    setStatusMessage("");
    try {
      if (selectedOpportunity?.id) {
        await updateOpportunity({
          opportunityId: selectedOpportunity.id,
          patch: form,
          userId,
          onLocalUpdate: commitLocal
        });
      } else {
        await createOpportunity({ opportunity: form, userId, onLocalUpdate: commitLocal });
      }
      finishAcceptedMutation();
      return true;
    } catch (error) {
      const acceptedLocally = handleSyncError(error, selectedOpportunity?.id ? "Opportunity" : "New opportunity");
      if (acceptedLocally) finishAcceptedMutation();
      return acceptedLocally;
    } finally {
      setIsBusy(false);
    }
  };

  const archiveOpportunity = async (opportunity) => {
    if (!userId || !opportunity?.id) return;
    setIsBusy(true);
    setStatusMessage("");
    try {
      await setOpportunityArchived({
        opportunityId: opportunity.id,
        archived: !opportunity.archived,
        userId,
        onLocalUpdate: commitLocal
      });
      finishAcceptedMutation();
    } catch (error) {
      const acceptedLocally = handleSyncError(error, opportunity.archived ? "Restored opportunity" : "Archived opportunity");
      if (acceptedLocally) finishAcceptedMutation();
    } finally {
      setIsBusy(false);
    }
  };

  const removeOpportunity = async (opportunityId) => {
    if (!userId || !opportunityId) return;
    setIsBusy(true);
    setStatusMessage("");
    try {
      await deleteOpportunity({ opportunityId, userId, onLocalUpdate: commitLocal });
      finishAcceptedMutation();
    } catch (error) {
      const acceptedLocally = handleSyncError(error, "Opportunity deletion");
      if (acceptedLocally) finishAcceptedMutation();
    } finally {
      setIsBusy(false);
    }
  };

  const retrySync = async () => {
    if (!userId || isBusy) return;
    setIsBusy(true);
    setStatusMessage("");
    try {
      const result = await flushOpportunityOperations(userId);
      refreshSyncState(userId);
      if (!result.ok) {
        handleSyncError(result.error, "Opportunity changes");
        return;
      }
      const loaded = await loadOpportunities(userId);
      setOpportunities(loaded);
      refreshSyncState(userId);
      setStatusTone("neutral");
      setStatusMessage("Opportunity changes synchronized.");
    } finally {
      setIsBusy(false);
    }
  };

  const hasFilters = Boolean(search.trim()) || typeFilter !== "all" || lifecycleFilter !== "active";
  const emptyMessage = opportunities.length === 0
    ? "No opportunities yet. Add the first item to start building the landscape."
    : hasFilters
      ? "No opportunities match these filters."
      : "No active opportunities.";

  return (
    <AppShell activeNavItem="opportunities" hideMobileNav={isEditorOpen}>
      <section className={styles.workspace}>
        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <div className={styles.headingGroup}>
              <h2 className={styles.title}>Opportunity Landscape</h2>
              <span className={styles.count}>{filteredOpportunities.length}</span>
              <span className={syncBadge.className}>{syncBadge.label}</span>
            </div>
            <span className={styles.toolbarSpacer} />
            <button type="button" className={styles.addButton} onClick={openAdd} aria-label="Add opportunity" title="Add opportunity">+</button>
          </div>

          <div className={styles.filters}>
            <input
              type="search"
              className={styles.control}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search opportunities…"
              aria-label="Search opportunities"
            />
            <select
              className={styles.control}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="Filter by opportunity type"
            >
              <option value="all">All types</option>
              {OPPORTUNITY_TYPES.map((type) => (
                <option key={type} value={type}>{OPPORTUNITY_TYPE_LABELS[type]}</option>
              ))}
            </select>
            <select
              className={styles.control}
              value={lifecycleFilter}
              onChange={(event) => setLifecycleFilter(event.target.value)}
              aria-label="Filter by lifecycle"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">Active + archived</option>
            </select>
          </div>

          {statusMessage ? (
            <div className={`${styles.statusBar}${statusTone === "error" ? ` ${styles.statusBarError}` : ""}`} role="status">
              <span>{statusMessage}</span>
              {syncState.pendingCount > 0 && syncState.conflictCount === 0 ? (
                <button type="button" className={styles.retryButton} onClick={retrySync} disabled={isBusy}>Retry sync</button>
              ) : null}
            </div>
          ) : null}

          <div className={styles.content}>
            {isLoading && opportunities.length === 0 ? (
              <div className={styles.empty}>Loading opportunities…</div>
            ) : filteredOpportunities.length === 0 ? (
              <div className={styles.empty}>{emptyMessage}</div>
            ) : (
              <OpportunityTable opportunities={filteredOpportunities} onSelect={openEdit} />
            )}
          </div>
        </section>
      </section>

      <OpportunityEditor
        isOpen={isEditorOpen}
        opportunity={selectedOpportunity}
        isBusy={isBusy}
        onClose={closeEditor}
        onSave={saveOpportunity}
        onDelete={removeOpportunity}
        onArchiveToggle={archiveOpportunity}
      />
    </AppShell>
  );
}
