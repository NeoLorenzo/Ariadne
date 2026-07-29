"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import DirectionPanel from "@/components/DirectionPanel";
import StrategicObjectives from "@/components/StrategicObjectives";
import { SecondaryButton } from "@/components/ui/FabbroUI";
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
  recordClientDetectedSubstackSignal,
  requestServerSubstackRefresh
} from "@/lib/signals/substackSignalRepository";

const LORENZO_ROQUE_SUBSTACK = {
  archiveUrl: "https://lorenzoroque.substack.com/api/v1/archive?sort=new&offset=0&limit=1",
  feedJsonUrl:
    "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Florenzoroque.substack.com%2Ffeed"
};
const PROJECTS_STORAGE_KEY = "fabbro_projects_v1";
const PROTOLORENZO_VIDEO_STATE_STORAGE_KEY = "fabbro_youtube_state_v1";
const GITHUB_REPO_PROJECT_ID_PREFIX = "github-repo-";
const PROJECT_STATUS_ACTIVE = "active";
const REPO_STATUS_TAG_ACTIVE = "active";
const DEFAULT_NOTICE_BOARD_ITEMS = [];
const DASHBOARD_NOTICE_CACHE_NAMESPACE = "dashboard.notice_board";
const DAY_MS = 24 * 60 * 60 * 1000;
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
  const [activeDirection, setActiveDirection] = useState(null);
  const [copyState, setCopyState] = useState({ status: "idle", message: "" });

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
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadLatestPostTimestamp = async () => {
      const cachedSignal = await loadCachedSubstackSignal();
      if (isMounted && Number.isFinite(cachedSignal?.publishedAtTimestamp)) {
        setSubstackLatestPostTimestamp(cachedSignal.publishedAtTimestamp);
      }

      const [serverSignal, clientDetectedEntry] = await Promise.all([
        requestServerSubstackRefresh(),
        fetchLatestSubstackEntry()
      ]);
      const clientSavedSignal = clientDetectedEntry
        ? await recordClientDetectedSubstackSignal(clientDetectedEntry)
        : null;
      const latestPostTimestamp = [
        cachedSignal?.publishedAtTimestamp,
        serverSignal?.publishedAtTimestamp,
        clientSavedSignal?.publishedAtTimestamp,
        clientDetectedEntry ? Date.parse(clientDetectedEntry.publishedAt) : null
      ]
        .filter((timestamp) => Number.isFinite(timestamp))
        .reduce((latest, timestamp) => Math.max(latest, timestamp), Number.NEGATIVE_INFINITY);

      if (isMounted && Number.isFinite(latestPostTimestamp)) {
        setSubstackLatestPostTimestamp(latestPostTimestamp);
      }
    };

    void loadLatestPostTimestamp();

    return () => {
      isMounted = false;
    };
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
        if (!isMounted) {
          return;
        }
        const nextUserId = data?.session?.user?.id || null;
        setAuthUserId(nextUserId);
        writeLastKnownSyncUserId(nextUserId);
      })
      .catch(() => {
        if (isMounted) {
          setAuthUserId(readLastKnownSyncUserId());
        }
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

    const loadNoticeBoardItems = async () => {
      const { userId, projects } = await loadProjectsSnapshotForNotices(authUserId);
      const cacheUserId = userId || authUserId || "signed-out";
      const cachedEntry = readSyncCacheEntry({
        namespace: DASHBOARD_NOTICE_CACHE_NAMESPACE,
        userId: cacheUserId
      });
      const cachedPayload = cachedEntry?.payload;
      if (isMounted && Array.isArray(cachedPayload)) {
        setNoticeBoardItems(cachedPayload);
      }

      const nextNoticeItems = buildDashboardNotices({
        projects,
        substackDaysSinceLastPublication,
        protoLorenzoVideoBacklogDays,
        hasSubstackTimestamp: Number.isFinite(substackLatestPostTimestamp)
      });
      const nextNoticeSignature = getDashboardListCacheSignature(nextNoticeItems);

      if (!isMounted) {
        return;
      }
      if (nextNoticeSignature !== String(cachedEntry?.signature || "")) {
        setNoticeBoardItems(nextNoticeItems);
      }
      upsertSyncCacheEntryIfChanged({
        namespace: DASHBOARD_NOTICE_CACHE_NAMESPACE,
        userId: cacheUserId,
        payload: nextNoticeItems,
        signature: nextNoticeSignature
      });
    };

    void loadNoticeBoardItems();

    return () => {
      isMounted = false;
    };
  }, [
    authUserId,
    protoLorenzoVideoBacklogDays,
    substackDaysSinceLastPublication,
    substackLatestPostTimestamp
  ]);

  const handleProtoLorenzoScheduledDateChange = (nextDateValue) => {
    const normalizedDate = normalizeDateInputValue(nextDateValue);
    setProtoLorenzoLatestScheduledDate(normalizedDate);
    writeProtoLorenzoVideoStateToStorage({
      ...readProtoLorenzoVideoStateFromStorage(),
      protoLorenzoLatestScheduledDate: normalizedDate
    });
  };

  const videoBacklogSeverity = resolveVideoBacklogSeverity(protoLorenzoVideoBacklogDays);

  const copyFullAppData = async () => {
    if (copyState.status === "copying") {
      return;
    }

    setCopyState({ status: "copying", message: "" });
    try {
      const projectSnapshot = await loadProjectsSnapshotForNotices(authUserId);
      const exportText = await buildFullAppDataText({
        userId: authUserId,
        projects: projectSnapshot.projects,
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

  return (
    <AppShell currentPageLabel="Dashboard" activeNavItem="dashboard">
      <section className="dashboard-workspace">
        <section className="dashboard-modal">
          <header className="dashboard-modal-header">
            <h2 className="dashboard-modal-title">Dashboard</h2>
            <SecondaryButton
              className="dashboard-copy-data-btn"
              onClick={copyFullAppData}
              disabled={copyState.status === "copying"}
              aria-live="polite"
              title={copyState.message || "Copy all stored app data as structured text"}
            >
              {copyButtonLabel}
            </SecondaryButton>
          </header>

          <div className="dashboard-modal-body">
            <section className="dashboard-strategy" aria-label="Strategy">
              <DirectionPanel userId={authUserId} onDirectionChange={setActiveDirection} />
              <StrategicObjectives directionId={activeDirection?.id} userId={authUserId} />
            </section>
            <section className="notice-board-modal">
              <header className="notice-board-header">
                <h3 className="notice-board-title">Notice board</h3>
              </header>
              <hr className="notice-board-divider" />
              <ol className="notice-board-list">
                {noticeBoardItems.map((noticeItem) => (
                  <li
                    key={noticeItem.id}
                    className={`notice-board-item ${noticeItem.severity ? `is-${noticeItem.severity}` : ""}`}
                  >
                    <p className="notice-board-item-line">
                      <span className="notice-board-item-title">{noticeItem.title}</span>
                      <span>{noticeItem.text}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="dashboard-links-modal" aria-label="Quick links">
              {DASHBOARD_LINKS.map((dashboardLink) => (
                <a
                  key={dashboardLink.href}
                  className="dashboard-link-btn"
                  href={dashboardLink.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {dashboardLink.label}
                </a>
              ))}
            </section>

            <section className="signals-modal">
              <header className="signals-modal-header">
                <h3 className="signals-modal-title">Signals</h3>
              </header>

              <div className="signals-grid">
                <article className="signal-card">
                  <h4 className="signal-card-title">Lorenzo Roque Substack</h4>
                  <div className="signal-metric-row">
                    <span>Days since post</span>
                    <strong className={resolveSignalRecencyClass(substackDaysSinceLastPublication)}>
                      {formatSignalDayCount(substackDaysSinceLastPublication)}
                    </strong>
                  </div>
                </article>

                <article className="signal-card">
                  <h4 className="signal-card-title">ProtoLorenzo</h4>
                  <label className="signal-date-field">
                    <span>Latest scheduled</span>
                    <input
                      type="date"
                      className="signal-date-input"
                      value={protoLorenzoLatestScheduledDate}
                      onChange={(event) =>
                        handleProtoLorenzoScheduledDateChange(event.target.value)
                      }
                    />
                  </label>
                  <div className="signal-metric-row">
                    <span>Backlog</span>
                    <strong className={videoBacklogSeverity ? `is-${videoBacklogSeverity}` : ""}>
                      {formatVideoBacklogDayCount(protoLorenzoVideoBacklogDays)}
                    </strong>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </section>
      </section>
    </AppShell>
  );
}

async function fetchLatestSubstackEntry() {
  const directEntry = await fetchLatestSubstackArchiveEntry();
  if (directEntry) {
    return directEntry;
  }

  return fetchLatestSubstackFeedEntry();
}

async function fetchLatestSubstackArchiveEntry() {
  try {
    const response = await fetch(LORENZO_ROQUE_SUBSTACK.archiveUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }

    const archiveRows = await response.json();
    const latestPost = Array.isArray(archiveRows) ? archiveRows[0] : null;
    const publishedAt = parseFlexibleDate(latestPost?.post_date || latestPost?.postDate);
    if (!publishedAt) {
      return null;
    }
    return {
      publishedAt: publishedAt.toISOString(),
      title: String(latestPost?.title || ""),
      url: String(
        latestPost?.canonical_url ||
          latestPost?.canonicalUrl ||
          (latestPost?.slug
            ? `https://lorenzoroque.substack.com/p/${latestPost.slug}`
            : "")
      )
    };
  } catch {
    return null;
  }
}

async function fetchLatestSubstackFeedEntry() {
  try {
    const response = await fetch(LORENZO_ROQUE_SUBSTACK.feedJsonUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }

    const feedPayload = await response.json();
    const latestItem = Array.isArray(feedPayload?.items) ? feedPayload.items[0] : null;
    const publishedAt = parseFlexibleDate(latestItem?.pubDate || latestItem?.pubdate);
    if (!publishedAt) {
      return null;
    }
    return {
      publishedAt: publishedAt.toISOString(),
      title: String(latestItem?.title || ""),
      url: String(latestItem?.link || "")
    };
  } catch {
    return null;
  }
}

async function loadProjectsSnapshotForNotices(authUserId) {
  const localProjects = readProjectsSnapshotFromStorage();

  if (supabase && authUserId) {
    const { data, error } = await supabase
      .from("user_projects")
      .select("projects")
      .eq("user_id", authUserId)
      .maybeSingle();

    if (!error && Array.isArray(data?.projects)) {
      return {
        userId: authUserId,
        projects: data.projects
      };
    }

    return {
      userId: authUserId,
      projects: localProjects
    };
  }

  return {
    userId: null,
    projects: localProjects
  };
}

function readProjectsSnapshotFromStorage() {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  const threeDaysMs = 3 * DAY_MS;
  const weekMs = 7 * DAY_MS;
  const twoWeeksMs = 14 * DAY_MS;
  const threeMonthsMs = 90 * DAY_MS;

  return safeProjects
    .filter((project) => {
      const projectId = String(project?.id || "");
      if (!projectId.startsWith(GITHUB_REPO_PROJECT_ID_PREFIX)) {
        return false;
      }

      const completionStatus = normalizeProjectCompletionStatus(project?.completionStatus);
      if (completionStatus !== PROJECT_STATUS_ACTIVE) {
        return false;
      }

      const repoStatusTag = normalizeRepoStatusTag(project?.repoStatusTag);
      if (repoStatusTag !== REPO_STATUS_TAG_ACTIVE) {
        return false;
      }

      const lastCommitAt = Number(project?.lastCommitAt);
      return Number.isFinite(lastCommitAt);
    })
    .map((project) => {
      const lastCommitAt = Number(project.lastCommitAt);
      const elapsedMs = Math.max(0, now - lastCommitAt);
      const inactiveDays = Math.floor(elapsedMs / DAY_MS);
      const repoName = String(project?.title || "Unknown repo").trim() || "Unknown repo";

      if (elapsedMs > threeMonthsMs) {
        return {
          id: `repo-inactivity-danger-${String(project?.id || repoName).toLowerCase()}`,
          title: "Danger",
          severity: "danger",
          sortWeight: elapsedMs,
          text: `${repoName} has no commit for ${inactiveDays} days (over 3 months).`
        };
      }

      if (elapsedMs > twoWeeksMs) {
        return {
          id: `major-repo-inactivity-${String(project?.id || repoName).toLowerCase()}`,
          title: "Major warning",
          severity: "major",
          sortWeight: elapsedMs,
          text: `${repoName} has no commit for ${inactiveDays} days (over 2 weeks).`
        };
      }

      if (elapsedMs > weekMs) {
        return {
          id: `repo-inactivity-warning-${String(project?.id || repoName).toLowerCase()}`,
          title: "Warning",
          severity: "warning",
          sortWeight: elapsedMs,
          text: `${repoName} has no commit for ${inactiveDays} days (over 1 week).`
        };
      }

      if (elapsedMs > threeDaysMs) {
        return {
          id: `repo-inactivity-info-${String(project?.id || repoName).toLowerCase()}`,
          title: "Info",
          severity: "info",
          sortWeight: elapsedMs,
          text: `${repoName} has no commit for ${inactiveDays} days (over 3 days).`
        };
      }

      return null;
    })
    .filter(Boolean);
}

function buildSubstackPublicationNotices(daysSinceLastPublication, hasSubstackTimestamp) {
  if (!hasSubstackTimestamp) {
    return [];
  }

  if (!Number.isFinite(daysSinceLastPublication) || daysSinceLastPublication < 2) {
    return [];
  }

  const elapsedMs = daysSinceLastPublication * DAY_MS;
  if (daysSinceLastPublication >= 14) {
    return [
      {
        id: "substack-publication-danger",
        title: "Danger",
        severity: "danger",
        sortWeight: elapsedMs,
        text: `Lorenzo Roque Substack has no publication for ${daysSinceLastPublication} days (2+ weeks).`
      }
    ];
  }

  if (daysSinceLastPublication >= 7) {
    return [
      {
        id: "substack-publication-major",
        title: "Major warning",
        severity: "major",
        sortWeight: elapsedMs,
        text: `Lorenzo Roque Substack has no publication for ${daysSinceLastPublication} days (1+ week).`
      }
    ];
  }

  if (daysSinceLastPublication >= 4) {
    return [
      {
        id: "substack-publication-warning",
        title: "Warning",
        severity: "warning",
        sortWeight: elapsedMs,
        text: `Lorenzo Roque Substack has no publication for ${daysSinceLastPublication} days (4+ days).`
      }
    ];
  }

  return [
    {
      id: "substack-publication-info",
      title: "Info",
      severity: "info",
      sortWeight: elapsedMs,
      text: `Lorenzo Roque Substack has no publication for ${daysSinceLastPublication} days (2+ days).`
    }
  ];
}

function buildProtoLorenzoVideoNotices(protoLorenzoVideoBacklogDays) {
  const videoBacklogSeverity = resolveVideoBacklogSeverity(protoLorenzoVideoBacklogDays);
  if (!videoBacklogSeverity) {
    return [];
  }

  const noticeTitleBySeverity = {
    danger: "Danger",
    major: "Major warning",
    warning: "Warning",
    info: "Info",
    success: "Success"
  };
  const severitySortWeightBySeverity = {
    danger: 5,
    major: 4,
    warning: 3,
    info: 2,
    success: 1
  };

  return [
    {
      id: "protolorenzo-video-backlog",
      title: noticeTitleBySeverity[videoBacklogSeverity] || "Info",
      severity: videoBacklogSeverity,
      sortWeight: severitySortWeightBySeverity[videoBacklogSeverity] || 0,
      text: `ProtoLorenzo video backlog is ${formatVideoBacklogDayCount(protoLorenzoVideoBacklogDays)}.`
    }
  ];
}

function normalizeProjectCompletionStatus(rawValue) {
  return String(rawValue || "").trim().toLowerCase() === "completed" ? "completed" : PROJECT_STATUS_ACTIVE;
}

function normalizeRepoStatusTag(rawValue) {
  return String(rawValue || "").trim().toLowerCase();
}

function parseFlexibleDate(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const isoLikeMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!isoLikeMatch) {
    return null;
  }

  const day = Number(isoLikeMatch[1]);
  const month = Number(isoLikeMatch[2]);
  const yearPart = Number(isoLikeMatch[3]);
  const year = yearPart < 100 ? 2000 + yearPart : yearPart;
  const fallback = new Date(year, month - 1, day);
  if (Number.isNaN(fallback.getTime())) {
    return null;
  }

  return fallback;
}

function calculateDaysSinceTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - Number(timestamp)) / DAY_MS));
}

function resolveSignalRecencyClass(daysSinceLastPublication) {
  if (!Number.isFinite(daysSinceLastPublication)) {
    return "";
  }
  if (daysSinceLastPublication >= 14) {
    return "is-danger";
  }
  if (daysSinceLastPublication >= 7) {
    return "is-major";
  }
  if (daysSinceLastPublication >= 4) {
    return "is-warning";
  }
  if (daysSinceLastPublication >= 2) {
    return "is-info";
  }
  return "";
}

function formatSignalDayCount(daysSinceLastPublication) {
  if (!Number.isFinite(daysSinceLastPublication)) {
    return "--";
  }

  return new Intl.NumberFormat("en-GB").format(daysSinceLastPublication);
}

function readProtoLorenzoVideoStateFromStorage() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PROTOLORENZO_VIDEO_STATE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeProtoLorenzoVideoStateToStorage(nextState) {
  if (typeof window === "undefined") {
    return;
  }

  const safeState = nextState && typeof nextState === "object" ? nextState : {};
  window.localStorage.setItem(PROTOLORENZO_VIDEO_STATE_STORAGE_KEY, JSON.stringify(safeState));
}

function normalizeDateInputValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

function calculateDaysUntilScheduledDate(dateValue) {
  const normalizedDate = normalizeDateInputValue(dateValue);
  if (!normalizedDate) {
    return null;
  }

  const scheduledDate = new Date(`${normalizedDate}T00:00:00`);
  if (Number.isNaN(scheduledDate.getTime())) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((scheduledDate.getTime() - today.getTime()) / DAY_MS);
}

function resolveVideoBacklogSeverity(daysUntilScheduledDate) {
  if (!Number.isFinite(daysUntilScheduledDate)) {
    return "";
  }
  if (daysUntilScheduledDate <= 2) {
    return "danger";
  }
  if (daysUntilScheduledDate <= 5) {
    return "major";
  }
  if (daysUntilScheduledDate <= 8) {
    return "warning";
  }
  if (daysUntilScheduledDate <= 14) {
    return "info";
  }
  return "success";
}

function formatVideoBacklogDayCount(daysUntilScheduledDate) {
  if (!Number.isFinite(daysUntilScheduledDate)) {
    return "--";
  }

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
