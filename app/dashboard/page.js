"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import DashboardStrategyOverview from "@/components/DashboardStrategyOverview";
import GitHubReposModule from "@/components/GitHubReposModule";
import { SecondaryButton } from "@/components/ui/AriadneUI";
import { buildFullAppDataText, copyTextToClipboard } from "@/lib/export/appDataText";
import { supabase } from "@/lib/supabase/client";
import {
  readLastKnownSyncUserId,
  readSyncCacheEntry,
  upsertSyncCacheEntryIfChanged,
  writeLastKnownSyncUserId
} from "@/lib/storage/syncCache";
import {
  loadCachedSubstackSignal,
  requestServerSubstackRefresh
} from "@/lib/signals/substackSignalRepository";
import styles from "./dashboard.module.css";

const PROTOLORENZO_VIDEO_STATE_STORAGE_KEY = "fabbro_youtube_state_v1";
const GITHUB_REPO_PROJECT_ID_PREFIX = "github-repo-";
const PROJECT_STATUS_ACTIVE = "active";
const REPO_STATUS_TAG_ACTIVE = "active";
const DEFAULT_NOTICE_BOARD_ITEMS = [];
const DASHBOARD_NOTICE_CACHE_NAMESPACE = "dashboard.notice_board";
const DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_NOTICE_LIMIT = 4;
const DASHBOARD_LINKS = [
  {
    label: "GitHub Repos",
    href: "https://github.com/NeoLorenzo?tab=repositories"
  },
  {
    label: "Substack Publish",
    href: "https://lorenzoroque.substack.com/publish/home"
  },
  {
    label: "NeoLorenzo Studio",
    href: "https://studio.youtube.com/channel/UCUG_Lhs2mnR2a3maR912Vwg"
  },
  {
    label: "ProtoLorenzo Studio",
    href: "https://studio.youtube.com/channel/UCg6TNjtYviUtFHCprQMgbaQ"
  }
];

export default function DashboardPage() {
  const [noticeBoardItems, setNoticeBoardItems] = useState(DEFAULT_NOTICE_BOARD_ITEMS);
  const [authUserId, setAuthUserId] = useState(() => readLastKnownSyncUserId());
  const [substackLatestPostTimestamp, setSubstackLatestPostTimestamp] = useState(null);
  const [protoLorenzoLatestScheduledDate, setProtoLorenzoLatestScheduledDate] = useState("");
  const [copyState, setCopyState] = useState({ status: "idle", message: "" });
  const [canonicalProjects, setCanonicalProjects] = useState([]);
  const [isNoticeBoardExpanded, setIsNoticeBoardExpanded] = useState(false);

  const handleProjectsChange = useCallback(({ projects }) => {
    setCanonicalProjects(Array.isArray(projects) ? projects : []);
  }, []);

  useEffect(() => {
    const refreshProtoLorenzoVideoState = () => {
      const videoState = readProtoLorenzoVideoStateFromStorage();
      setProtoLorenzoLatestScheduledDate(
        normalizeDateInputValue(videoState?.protoLorenzoLatestScheduledDate)
      );
    };

    refreshProtoLorenzoVideoState();
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleStorageChange = (event) => {
      if (event.key && event.key !== PROTOLORENZO_VIDEO_STATE_STORAGE_KEY) {
        return;
      }
      refreshProtoLorenzoVideoState();
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadLatestPostTimestamp = async () => {
      const cachedSignal = await loadCachedSubstackSignal();
      if (isMounted && Number.isFinite(cachedSignal?.publishedAtTimestamp)) {
        setSubstackLatestPostTimestamp(cachedSignal.publishedAtTimestamp);
      }

      const serverSignal = await requestServerSubstackRefresh();
      const latestPostTimestamp = [
        cachedSignal?.publishedAtTimestamp,
        serverSignal?.publishedAtTimestamp
      ]
        .filter((timestamp) => Number.isFinite(timestamp))
        .reduce((latest, timestamp) => Math.max(latest, timestamp), Number.NEGATIVE_INFINITY);

      if (isMounted && Number.isFinite(latestPostTimestamp)) {
        setSubstackLatestPostTimestamp(latestPostTimestamp);
      }
    };

    void loadLatestPostTimestamp();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthUserId(null);
      return undefined;
    }

    let isMounted = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        const nextUserId = data?.session?.user?.id || null;
        setAuthUserId(nextUserId);
        writeLastKnownSyncUserId(nextUserId);
      })
      .catch(() => {
        if (isMounted) setAuthUserId(readLastKnownSyncUserId());
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id || null;
      setAuthUserId(nextUserId);
      writeLastKnownSyncUserId(nextUserId);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const substackDaysSinceLastPublication = useMemo(
    () => calculateDaysSinceTimestamp(substackLatestPostTimestamp),
    [substackLatestPostTimestamp]
  );
  const protoLorenzoVideoBacklogDays = useMemo(
    () => calculateDaysUntilScheduledDate(protoLorenzoLatestScheduledDate),
    [protoLorenzoLatestScheduledDate]
  );

  useEffect(() => {
    let isMounted = true;
    const lastKnownUserId = authUserId || readLastKnownSyncUserId() || "signed-out";
    const cachedBootEntry = readSyncCacheEntry({
      namespace: DASHBOARD_NOTICE_CACHE_NAMESPACE,
      userId: lastKnownUserId
    });
    if (Array.isArray(cachedBootEntry?.payload)) {
      setNoticeBoardItems(cachedBootEntry.payload);
    }

    const cacheUserId = authUserId || "signed-out";
    const cachedEntry = readSyncCacheEntry({
      namespace: DASHBOARD_NOTICE_CACHE_NAMESPACE,
      userId: cacheUserId
    });
    if (isMounted && Array.isArray(cachedEntry?.payload)) {
      setNoticeBoardItems(cachedEntry.payload);
    }

    const nextNoticeItems = buildDashboardNotices({
      projects: canonicalProjects,
      substackDaysSinceLastPublication,
      protoLorenzoVideoBacklogDays,
      hasSubstackTimestamp: Number.isFinite(substackLatestPostTimestamp)
    });
    const nextNoticeSignature = getDashboardListCacheSignature(nextNoticeItems);

    if (isMounted && nextNoticeSignature !== String(cachedEntry?.signature || "")) {
      setNoticeBoardItems(nextNoticeItems);
    }
    upsertSyncCacheEntryIfChanged({
      namespace: DASHBOARD_NOTICE_CACHE_NAMESPACE,
      userId: cacheUserId,
      payload: nextNoticeItems,
      signature: nextNoticeSignature
    });

    return () => { isMounted = false; };
  }, [
    authUserId,
    canonicalProjects,
    protoLorenzoVideoBacklogDays,
    substackDaysSinceLastPublication,
    substackLatestPostTimestamp
  ]);

  const copyFullAppData = async () => {
    if (copyState.status === "copying") return;
    setCopyState({ status: "copying", message: "" });

    try {
      const exportText = await buildFullAppDataText({
        userId: authUserId,
        projects: canonicalProjects,
        noticeBoardItems,
        signals: {
          substackLatestPostTimestamp,
          substackDaysSinceLastPublication,
          protoLorenzoLatestScheduledDate,
          protoLorenzoVideoBacklogDays
        }
      });
      await copyTextToClipboard(exportText);
      setCopyState({ status: "copied", message: "Full app data copied to the clipboard." });
    } catch (error) {
      setCopyState({
        status: "error",
        message: `Copy failed: ${error?.message || "Unknown error"}`
      });
    }
  };

  const copyButtonLabel = {
    copying: "Copying…",
    copied: "Copied",
    error: "Try copy again"
  }[copyState.status] || "Copy all data";

  const visibleNoticeItems = useMemo(() => {
    if (isNoticeBoardExpanded) return noticeBoardItems;
    return noticeBoardItems.slice(0, INITIAL_NOTICE_LIMIT);
  }, [noticeBoardItems, isNoticeBoardExpanded]);

  const attentionItems = useMemo(() => noticeBoardItems.slice(0, 3), [noticeBoardItems]);

  return (
    <AppShell currentPageLabel="Dashboard" activeNavItem="dashboard">
      <section className="dashboard-workspace">
        <div className="dashboard-container">
          <header className={`dashboard-header ${styles.pageHeader}`}>
            <div className={styles.headerIntro}>
              <span className={styles.eyebrow}>Operating overview</span>
              <h2 className="dashboard-title">Dashboard</h2>
              <p className={styles.headerSubtitle}>What needs attention now, followed by the current strategic state.</p>
            </div>
            <details className={styles.utilityMenu}>
              <summary aria-label="Dashboard utilities">•••</summary>
              <div className={styles.utilityPopover}>
                <SecondaryButton
                  className="dashboard-copy-data-btn"
                  onClick={copyFullAppData}
                  disabled={copyState.status === "copying"}
                  aria-live="polite"
                  title={copyState.message || "Copy all stored app data as structured text"}
                >
                  {copyButtonLabel}
                </SecondaryButton>
              </div>
            </details>
          </header>

          <div className={`dashboard-body ${styles.dashboardBody}`}>
            <section className={styles.nowSection} aria-labelledby="dashboard-now-title">
              <header className={styles.nowHeader}>
                <div>
                  <span className={styles.eyebrow}>Attention</span>
                  <div className={styles.titleRow}>
                    <h3 id="dashboard-now-title">Now</h3>
                    <span className={styles.countPill}>{noticeBoardItems.length} active signal{noticeBoardItems.length === 1 ? "" : "s"}</span>
                  </div>
                </div>
              </header>

              {attentionItems.length ? (
                <div className={styles.nowGrid}>
                  {attentionItems.map((noticeItem) => (
                    <article
                      className={styles.attentionCard}
                      data-severity={noticeItem.severity || "info"}
                      key={noticeItem.id}
                    >
                      <span className={styles.attentionLabel}>{noticeItem.title}</span>
                      <p>{noticeItem.text}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyStrategy}>No active operational notices.</div>
              )}

              <div className={styles.navLinks} aria-label="Primary execution surfaces">
                <a className={styles.navCard} href="/tasks">
                  <strong>Tasks</strong>
                  <p>Open the execution list and work from current priorities.</p>
                </a>
                <a className={styles.navCard} href="/opportunities">
                  <strong>Opportunities</strong>
                  <p>Review the Landscape and pending opportunity candidates.</p>
                </a>
              </div>
            </section>

            <DashboardStrategyOverview userId={authUserId} />

            <div className={styles.operationalGrid}>
              <div className={styles.operationalColumn}>
                <section className="notice-board-module" aria-label="Notice board">
                  <header className="notice-board-header">
                    <div className="notice-board-title-group">
                      <h3 className="notice-board-title">Notice board</h3>
                      {noticeBoardItems.length ? (
                        <span className="notice-board-count-pill">{noticeBoardItems.length} issue{noticeBoardItems.length === 1 ? "" : "s"}</span>
                      ) : null}
                    </div>
                    {noticeBoardItems.length > INITIAL_NOTICE_LIMIT ? (
                      <button
                        type="button"
                        className="notice-board-toggle-btn"
                        aria-expanded={isNoticeBoardExpanded}
                        onClick={() => setIsNoticeBoardExpanded(!isNoticeBoardExpanded)}
                      >
                        {isNoticeBoardExpanded ? "Collapse" : `View all (${noticeBoardItems.length})`}
                      </button>
                    ) : null}
                  </header>

                  <ul className="notice-board-list">
                    {visibleNoticeItems.length ? visibleNoticeItems.map((noticeItem) => (
                      <li
                        key={noticeItem.id}
                        className={`notice-board-item ${noticeItem.severity ? `is-${noticeItem.severity}` : ""}`}
                      >
                        <div className="notice-board-item-header">
                          <span className={`notice-severity-badge is-${noticeItem.severity || "info"}`}>
                            {noticeItem.title}
                          </span>
                        </div>
                        <p className="notice-board-item-text">{noticeItem.text}</p>
                      </li>
                    )) : (
                      <li className="notice-board-empty">No active notices.</li>
                    )}
                  </ul>
                </section>
              </div>

              <div className={styles.operationalColumn}>
                <GitHubReposModule onProjectsChange={handleProjectsChange} />
              </div>
            </div>

            <section className={`quick-actions-module ${styles.quickActionsCompact}`} aria-label="Quick actions">
              <h3 className="quick-actions-title">External shortcuts</h3>
              <div className="quick-actions-list">
                {DASHBOARD_LINKS.map((dashboardLink) => (
                  <a
                    key={dashboardLink.href}
                    className="quick-action-pill"
                    href={dashboardLink.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{dashboardLink.label}</span>
                    <span className="quick-action-arrow" aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function buildDashboardNotices({
  projects,
  substackDaysSinceLastPublication,
  protoLorenzoVideoBacklogDays,
  hasSubstackTimestamp
}) {
  const notices = [...DEFAULT_NOTICE_BOARD_ITEMS];
  const dynamicNotices = [
    ...buildRepoCommitWarningNotices(projects),
    ...buildSubstackPublicationNotices(substackDaysSinceLastPublication, hasSubstackTimestamp),
    ...buildProtoLorenzoVideoNotices(protoLorenzoVideoBacklogDays)
  ];

  dynamicNotices
    .sort((left, right) => Number(right.sortWeight || 0) - Number(left.sortWeight || 0))
    .forEach((noticeItem) => {
      const { sortWeight, ...safeNoticeItem } = noticeItem;
      notices.push(safeNoticeItem);
    });

  return notices;
}

function buildRepoCommitWarningNotices(projectList) {
  const safeProjects = Array.isArray(projectList) ? projectList : [];
  const now = Date.now();
  const oneDayMs = DAY_MS;
  const weekMs = 7 * DAY_MS;
  const twoWeeksMs = 14 * DAY_MS;
  const threeMonthsMs = 90 * DAY_MS;

  return safeProjects
    .filter((project) => {
      const projectId = String(project?.id || "");
      if (!projectId.startsWith(GITHUB_REPO_PROJECT_ID_PREFIX)) return false;
      if (normalizeProjectCompletionStatus(project?.completionStatus) !== PROJECT_STATUS_ACTIVE) return false;
      if (normalizeRepoStatusTag(project?.repoStatusTag) !== REPO_STATUS_TAG_ACTIVE) return false;
      return Number.isFinite(Number(project?.lastCommitAt));
    })
    .map((project) => {
      const lastCommitAt = Number(project.lastCommitAt);
      const elapsedMs = Math.max(0, now - lastCommitAt);
      const inactiveDays = Math.floor(elapsedMs / DAY_MS);
      const repoName = String(project?.title || "Unknown repo").trim() || "Unknown repo";
      const identity = String(project?.id || repoName).toLowerCase();

      if (elapsedMs > threeMonthsMs) {
        return {
          id: `repo-inactivity-danger-${identity}`,
          title: "Danger",
          severity: "danger",
          sortWeight: elapsedMs,
          text: `${repoName} has no commit for ${inactiveDays} days (over 3 months).`
        };
      }
      if (elapsedMs > twoWeeksMs) {
        return {
          id: `major-repo-inactivity-${identity}`,
          title: "Major warning",
          severity: "major",
          sortWeight: elapsedMs,
          text: `${repoName} has no commit for ${inactiveDays} days (over 2 weeks).`
        };
      }
      if (elapsedMs > weekMs) {
        return {
          id: `repo-inactivity-warning-${identity}`,
          title: "Warning",
          severity: "warning",
          sortWeight: elapsedMs,
          text: `${repoName} has no commit for ${inactiveDays} days (over 1 week).`
        };
      }
      if (elapsedMs > oneDayMs) {
        return {
          id: `repo-inactivity-info-${identity}`,
          title: "Info",
          severity: "info",
          sortWeight: elapsedMs,
          text: `${repoName} has no commit for ${inactiveDays} ${inactiveDays === 1 ? "day" : "days"} (over 1 day).`
        };
      }
      return null;
    })
    .filter(Boolean);
}

function buildSubstackPublicationNotices(daysSinceLastPublication, hasSubstackTimestamp) {
  if (!hasSubstackTimestamp || !Number.isFinite(daysSinceLastPublication) || daysSinceLastPublication < 2) {
    return [];
  }

  const elapsedMs = daysSinceLastPublication * DAY_MS;
  if (daysSinceLastPublication >= 14) {
    return [{
      id: "substack-publication-danger",
      title: "Danger",
      severity: "danger",
      sortWeight: elapsedMs,
      text: `Lorenzo Roque Substack has no publication for ${daysSinceLastPublication} days (2+ weeks).`
    }];
  }
  if (daysSinceLastPublication >= 7) {
    return [{
      id: "substack-publication-major",
      title: "Major warning",
      severity: "major",
      sortWeight: elapsedMs,
      text: `Lorenzo Roque Substack has no publication for ${daysSinceLastPublication} days (1+ week).`
    }];
  }
  if (daysSinceLastPublication >= 4) {
    return [{
      id: "substack-publication-warning",
      title: "Warning",
      severity: "warning",
      sortWeight: elapsedMs,
      text: `Lorenzo Roque Substack has no publication for ${daysSinceLastPublication} days (4+ days).`
    }];
  }
  return [{
    id: "substack-publication-info",
    title: "Info",
    severity: "info",
    sortWeight: elapsedMs,
    text: `Lorenzo Roque Substack has no publication for ${daysSinceLastPublication} days (2+ days).`
  }];
}

function buildProtoLorenzoVideoNotices(daysUntilScheduledDate) {
  const severity = resolveVideoBacklogSeverity(daysUntilScheduledDate);
  if (!severity) return [];

  const titleBySeverity = {
    danger: "Danger",
    major: "Major warning",
    warning: "Warning",
    info: "Info",
    success: "Success"
  };
  const weightBySeverity = { danger: 5, major: 4, warning: 3, info: 2, success: 1 };

  return [{
    id: "protolorenzo-video-backlog",
    title: titleBySeverity[severity] || "Info",
    severity,
    sortWeight: weightBySeverity[severity] || 0,
    text: `ProtoLorenzo video backlog is ${formatVideoBacklogDayCount(daysUntilScheduledDate)}.`
  }];
}

function normalizeProjectCompletionStatus(rawValue) {
  return String(rawValue || "").trim().toLowerCase() === "completed" ? "completed" : PROJECT_STATUS_ACTIVE;
}

function normalizeRepoStatusTag(rawValue) {
  return String(rawValue || "").trim().toLowerCase();
}

function calculateDaysSinceTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - Number(timestamp)) / DAY_MS));
}

function readProtoLorenzoVideoStateFromStorage() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROTOLORENZO_VIDEO_STATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeDateInputValue(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

function calculateDaysUntilScheduledDate(dateValue) {
  const normalizedDate = normalizeDateInputValue(dateValue);
  if (!normalizedDate) return null;

  const scheduledDate = new Date(`${normalizedDate}T00:00:00`);
  if (Number.isNaN(scheduledDate.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((scheduledDate.getTime() - today.getTime()) / DAY_MS);
}

function resolveVideoBacklogSeverity(daysUntilScheduledDate) {
  if (!Number.isFinite(daysUntilScheduledDate)) return "";
  if (daysUntilScheduledDate <= 2) return "danger";
  if (daysUntilScheduledDate <= 5) return "major";
  if (daysUntilScheduledDate <= 8) return "warning";
  if (daysUntilScheduledDate <= 14) return "info";
  return "success";
}

function formatVideoBacklogDayCount(daysUntilScheduledDate) {
  if (!Number.isFinite(daysUntilScheduledDate)) return "--";
  const formattedDayCount = new Intl.NumberFormat("en-GB").format(daysUntilScheduledDate);
  return `${formattedDayCount} day${daysUntilScheduledDate === 1 ? "" : "s"}`;
}

function getDashboardListCacheSignature(listValue) {
  try {
    return JSON.stringify(Array.isArray(listValue) ? listValue : []);
  } catch {
    return "";
  }
}
