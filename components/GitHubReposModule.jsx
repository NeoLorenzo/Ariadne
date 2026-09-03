"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearGitHubProviderToken,
  prepareGitHubOAuth,
  readGitHubProviderToken
} from "@/lib/auth/githubProviderToken";
import { supabase } from "@/lib/supabase/client";
import {
  readLastKnownSyncUserId,
  readSyncCacheEntry,
  upsertSyncCacheEntryIfChanged
} from "@/lib/storage/syncCache";
import { projectCollectionsEqual, reconcileProjectCollections } from "@/lib/projects/reconcile";
import { createProjectWriteCoordinator } from "@/lib/projects/writeCoordinator";
import {
  buildGitHubOAuthCallbackUrl,
  getVisibleGitHubRepos,
  GITHUB_COMPANY_CATEGORIES,
  LEGACY_CATEGORY_TO_COMPANY
} from "@/lib/projects/githubRepos";

const PROJECTS_STORAGE_KEY = "fabbro_projects_v1";
const PROJECTS_SYNC_CACHE_NAMESPACE = "projects.resolved_cloud";
const PROJECT_STATUS_ACTIVE = "active";
const PROJECT_STATUS_COMPLETED = "completed";
const GITHUB_REPO_PROJECT_ID_PREFIX = "github-repo-";
const REPO_STATUS_TAG_ACTIVE = "active";

const ALL_COMPANY_CATEGORIES = GITHUB_COMPANY_CATEGORIES;
const CATEGORY_FALLBACK = ALL_COMPANY_CATEGORIES[0] || "General";
const GITHUB_CATEGORY_FALLBACK = GITHUB_COMPANY_CATEGORIES[0] || CATEGORY_FALLBACK;

const DEFAULT_PROJECTS = [];

export function useGitHubProjectSync({ onProjectsChange }) {
  const [projects, setProjects] = useState([]);
  const [cloudUserId, setCloudUserId] = useState(null);
  const [cloudVersion, setCloudVersion] = useState(null);
  const [isCloudSyncReady, setIsCloudSyncReady] = useState(false);
  const [cloudSnapshotSignaturesByProjectId, setCloudSnapshotSignaturesByProjectId] = useState({});
  const [isCloudWriteInFlight, setIsCloudWriteInFlight] = useState(false);
  const [didCloudWriteFail, setDidCloudWriteFail] = useState(false);
  const [isGitHubSyncing, setIsGitHubSyncing] = useState(false);
  const [githubSyncStatus, setGitHubSyncStatus] = useState("");
  const [hasGitHubProviderToken, setHasGitHubProviderToken] = useState(false);
  const [, setCloudReadState] = useState("idle");
  const [, setCloudReadSource] = useState("none");
  const [, setCloudReadErrorMessage] = useState("");
  const skipNextCloudWriteRef = useRef(false);
  const latestLocalProjectsRef = useRef([]);
  const latestCloudVersionRef = useRef(null);
  const latestCloudBaselineRef = useRef([]);
  const cloudWriteInFlightRef = useRef(false);
  const pendingCloudWriteRef = useRef(false);
  const projectWriteCoordinatorRef = useRef(createProjectWriteCoordinator());

  const resolveProjectsForUser = async (userId, fallbackProjects) => {
    if (!supabase || !userId) {
      return {
        projects: sanitizeProjectList(fallbackProjects),
        version: null,
        readState: "local",
        readSource: "no-supabase",
        readErrorMessage: ""
      };
    }

    const { data: remoteRow, error: remoteReadError } = await supabase
      .from("user_projects")
      .select("projects,version")
      .eq("user_id", userId)
      .maybeSingle();

    if (remoteReadError) {
      return {
        projects: sanitizeProjectList(fallbackProjects),
        version: null,
        readState: "error",
        readSource: "local-fallback",
        readErrorMessage: String(remoteReadError.message || "Cloud read failed.")
      };
    }

    if (Array.isArray(remoteRow?.projects)) {
      const cleanedProjects = sanitizeProjectList(remoteRow.projects);
      let resolvedVersion = Number.isFinite(Number(remoteRow.version)) ? Number(remoteRow.version) : 1;
      const hasLegacyRepoFields = remoteRow.projects.some(
        (project) => project && typeof project === "object"
          && (
            Object.prototype.hasOwnProperty.call(project, "currentPhase")
            || Object.prototype.hasOwnProperty.call(project, "progressPercent")
          )
      );
      if (hasLegacyRepoFields) {
        const { data: cleanedRow } = await supabase
          .from("user_projects")
          .update({
            projects: cleanedProjects,
            version: resolvedVersion + 1,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", userId)
          .eq("version", resolvedVersion)
          .select("version")
          .maybeSingle();
        if (cleanedRow) {
          resolvedVersion = Number(cleanedRow.version);
        }
      }
      return {
        projects: cleanedProjects,
        version: resolvedVersion,
        readState: "ok",
        readSource: "cloud",
        readErrorMessage: ""
      };
    }

    const localFallbackProjects = sanitizeProjectList(fallbackProjects);
    if (localFallbackProjects.length > 0) {
      const { error: seedError } = await supabase.from("user_projects").insert({
        user_id: userId,
        projects: localFallbackProjects
      });

      if (seedError) {
        const { data: raceRow, error: raceReadError } = await supabase
          .from("user_projects")
          .select("projects,version")
          .eq("user_id", userId)
          .maybeSingle();

        if (!raceReadError && Array.isArray(raceRow?.projects)) {
          return {
            projects: sanitizeProjectList(raceRow.projects),
            version: Number.isFinite(Number(raceRow.version)) ? Number(raceRow.version) : 1,
            readState: "ok",
            readSource: "cloud-race-resolve",
            readErrorMessage: ""
          };
        }

        return {
          projects: localFallbackProjects,
          version: null,
          readState: "error",
          readSource: "local-seed-error",
          readErrorMessage: String(seedError.message || "Cloud seed failed.")
        };
      }
    }

    return {
      projects: localFallbackProjects,
      version: localFallbackProjects.length > 0 ? 1 : null,
      readState: "ok",
      readSource: "local-seeded",
      readErrorMessage: ""
    };
  };

  useEffect(() => {
    const localProjects = readProjectsFromStorage();
    const fallbackProjects =
      localProjects.length > 0 ? sanitizeProjectList(localProjects) : sanitizeProjectList(DEFAULT_PROJECTS);

    setProjects(fallbackProjects);
    setCloudVersion(null);
    setCloudSnapshotSignaturesByProjectId({});
    setCloudReadState("local");
    setCloudReadSource("local-storage");
    setCloudReadErrorMessage("");

    if (!supabase) {
      setIsCloudSyncReady(true);
      return undefined;
    }

    const lastKnownUserId = readLastKnownSyncUserId();
    const cachedBootEntry = lastKnownUserId
      ? readSyncCacheEntry({
          namespace: PROJECTS_SYNC_CACHE_NAMESPACE,
          userId: lastKnownUserId
        })
      : null;
    const cachedBootPayload = cachedBootEntry?.payload;
    if (
      cachedBootPayload &&
      Array.isArray(cachedBootPayload.projects) &&
      Number.isFinite(Number(cachedBootPayload.version))
    ) {
      const cachedProjects = sanitizeProjectList(cachedBootPayload.projects);
      setProjects(cachedProjects);
      setCloudUserId(lastKnownUserId);
      setCloudVersion(Number(cachedBootPayload.version));
      setCloudSnapshotSignaturesByProjectId(createProjectSignatureMap(cachedProjects));
      setCloudReadState("ok");
      setCloudReadSource("cache-boot");
      writeProjectsToStorage(cachedProjects);
    }

    let isMounted = true;

    const initializeCloudSync = async () => {
      let usedCachedSnapshot = false;
      setIsCloudSyncReady(false);
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        const user = session?.user || null;
        setHasGitHubProviderToken(Boolean(readGitHubProviderToken(session)));
        const nextUserId = user?.id || null;
        if (!isMounted) {
          return;
        }

        setCloudUserId(nextUserId);
        if (!nextUserId) {
          setCloudVersion(null);
          setCloudSnapshotSignaturesByProjectId({});
          setCloudReadState("local");
          setCloudReadSource("signed-out");
          setCloudReadErrorMessage("");
          return;
        }

        const cachedEntry = readSyncCacheEntry({
          namespace: PROJECTS_SYNC_CACHE_NAMESPACE,
          userId: nextUserId
        });
        const cachedPayload = cachedEntry?.payload;
        if (
          cachedPayload &&
          Array.isArray(cachedPayload.projects) &&
          Number.isFinite(Number(cachedPayload.version))
        ) {
          const cachedProjects = sanitizeProjectList(cachedPayload.projects);
          skipNextCloudWriteRef.current = true;
          setProjects(cachedProjects);
          setCloudVersion(Number(cachedPayload.version));
          setCloudSnapshotSignaturesByProjectId(createProjectSignatureMap(cachedProjects));
          setCloudReadState("ok");
          setCloudReadSource("cache");
          setCloudReadErrorMessage("");
          writeProjectsToStorage(cachedProjects);
          usedCachedSnapshot = true;
          setIsCloudSyncReady(true);
        }

        const resolvedCloud = await resolveProjectsForUser(nextUserId, fallbackProjects);
        if (!isMounted) {
          return;
        }

        const resolvedVersion = Number.isFinite(Number(resolvedCloud.version))
          ? Number(resolvedCloud.version)
          : null;
        const resolvedCachePayload = {
          projects: sanitizeProjectList(resolvedCloud.projects),
          version: resolvedVersion
        };
        const resolvedCacheSignature = getProjectCollectionCacheSignature(resolvedCachePayload);
        const cachedSignature = String(cachedEntry?.signature || "");
        const didSyncChangeSnapshot =
          resolvedCloud.readState === "ok" && resolvedCacheSignature !== cachedSignature;

        if (!usedCachedSnapshot || didSyncChangeSnapshot) {
          skipNextCloudWriteRef.current = true;
          setProjects(resolvedCachePayload.projects);
          setCloudVersion(resolvedVersion);
          setCloudSnapshotSignaturesByProjectId(
            resolvedCloud.readState === "ok" ? createProjectSignatureMap(resolvedCachePayload.projects) : {}
          );
          setCloudReadState(resolvedCloud.readState);
          setCloudReadSource(resolvedCloud.readSource);
          setCloudReadErrorMessage(resolvedCloud.readErrorMessage);
          writeProjectsToStorage(resolvedCachePayload.projects);
        }

        if (resolvedCloud.readState === "ok" && Number.isFinite(Number(resolvedVersion))) {
          upsertSyncCacheEntryIfChanged({
            namespace: PROJECTS_SYNC_CACHE_NAMESPACE,
            userId: nextUserId,
            payload: resolvedCachePayload,
            signature: resolvedCacheSignature
          });
        }
      } catch {
        if (!isMounted) {
          return;
        }
        setCloudUserId(null);
        setCloudVersion(null);
        setCloudSnapshotSignaturesByProjectId({});
        setCloudReadState("local");
        setCloudReadSource("auth-lock-fallback");
        setCloudReadErrorMessage("");
      } finally {
        if (isMounted) {
          setIsCloudSyncReady(true);
        }
      }
    };

    void initializeCloudSync();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      const shouldRehydrate =
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION";
      if (!shouldRehydrate) {
        return;
      }

      window.setTimeout(async () => {
        let usedCachedSnapshot = false;
        const nextUserId = session?.user?.id || null;
        setHasGitHubProviderToken(Boolean(readGitHubProviderToken(session)));
        setCloudUserId(nextUserId);

        if (!nextUserId) {
          setCloudVersion(null);
          setCloudSnapshotSignaturesByProjectId({});
          setCloudReadState("local");
          setCloudReadSource("signed-out");
          setCloudReadErrorMessage("");
          setIsCloudSyncReady(true);
          return;
        }

        const localProjects = readProjectsFromStorage();
        const fallbackProjects =
          localProjects.length > 0 ? sanitizeProjectList(localProjects) : sanitizeProjectList(DEFAULT_PROJECTS);

        setIsCloudSyncReady(false);
        const cachedEntry = readSyncCacheEntry({
          namespace: PROJECTS_SYNC_CACHE_NAMESPACE,
          userId: nextUserId
        });
        const cachedPayload = cachedEntry?.payload;
        if (
          cachedPayload &&
          Array.isArray(cachedPayload.projects) &&
          Number.isFinite(Number(cachedPayload.version))
        ) {
          const cachedProjects = sanitizeProjectList(cachedPayload.projects);
          skipNextCloudWriteRef.current = true;
          setProjects(cachedProjects);
          setCloudVersion(Number(cachedPayload.version));
          setCloudSnapshotSignaturesByProjectId(createProjectSignatureMap(cachedProjects));
          setCloudReadState("ok");
          setCloudReadSource("cache");
          setCloudReadErrorMessage("");
          writeProjectsToStorage(cachedProjects);
          usedCachedSnapshot = true;
          setIsCloudSyncReady(true);
        }

        const resolvedCloud = await resolveProjectsForUser(nextUserId, fallbackProjects);
        const resolvedVersion = Number.isFinite(Number(resolvedCloud.version))
          ? Number(resolvedCloud.version)
          : null;
        const resolvedCachePayload = {
          projects: sanitizeProjectList(resolvedCloud.projects),
          version: resolvedVersion
        };
        const resolvedCacheSignature = getProjectCollectionCacheSignature(resolvedCachePayload);
        const cachedSignature = String(cachedEntry?.signature || "");
        const didSyncChangeSnapshot =
          resolvedCloud.readState === "ok" && resolvedCacheSignature !== cachedSignature;

        if (!usedCachedSnapshot || didSyncChangeSnapshot) {
          skipNextCloudWriteRef.current = true;
          setProjects(resolvedCachePayload.projects);
          setCloudVersion(resolvedVersion);
          setCloudSnapshotSignaturesByProjectId(
            resolvedCloud.readState === "ok" ? createProjectSignatureMap(resolvedCachePayload.projects) : {}
          );
          setCloudReadState(resolvedCloud.readState);
          setCloudReadSource(resolvedCloud.readSource);
          setCloudReadErrorMessage(resolvedCloud.readErrorMessage);
          writeProjectsToStorage(resolvedCachePayload.projects);
        }

        if (resolvedCloud.readState === "ok" && Number.isFinite(Number(resolvedVersion))) {
          upsertSyncCacheEntryIfChanged({
            namespace: PROJECTS_SYNC_CACHE_NAMESPACE,
            userId: nextUserId,
            payload: resolvedCachePayload,
            signature: resolvedCacheSignature
          });
        }
        setIsCloudSyncReady(true);
      }, 0);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    writeProjectsToStorage(projects);
    latestLocalProjectsRef.current = sanitizeProjectList(projects);
    latestCloudVersionRef.current = cloudVersion;
    latestCloudBaselineRef.current = sanitizeProjectList(
      Object.entries(cloudSnapshotSignaturesByProjectId).length ? latestCloudBaselineRef.current : projects
    );

    if (!supabase || !cloudUserId || !isCloudSyncReady) {
      return;
    }

    if (skipNextCloudWriteRef.current) {
      skipNextCloudWriteRef.current = false;
      return;
    }

    if (!projectWriteCoordinatorRef.current.start()) {
      pendingCloudWriteRef.current = true;
      return;
    }

    if (!Number.isFinite(Number(cloudVersion))) {
      setDidCloudWriteFail(true);
      setCloudReadState("error");
      setCloudReadSource("write-blocked-missing-version");
      setCloudReadErrorMessage("Cloud version is unknown; write skipped for safety.");
      return;
    }

    const expectedVersion = Number(latestCloudVersionRef.current);
    const writeSnapshot = sanitizeProjectList(latestLocalProjectsRef.current);
    const writeBaseline = sanitizeProjectList(latestCloudBaselineRef.current);
    let allowFollowUp = false;
    cloudWriteInFlightRef.current = true;
    setIsCloudWriteInFlight(true);
    setDidCloudWriteFail(false);

    void supabase
      .from("user_projects")
      .update({
        projects: writeSnapshot,
        updated_at: new Date().toISOString(),
        version: expectedVersion + 1
      })
      .eq("user_id", cloudUserId)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (error) {
          setDidCloudWriteFail(true);
          setCloudReadState("error");
          setCloudReadSource("write-error");
          setCloudReadErrorMessage(String(error.message || "Cloud write failed."));
          return;
        }

        if (data) {
          allowFollowUp = true;
          const nextVersion = expectedVersion + 1;
          const nextCachePayload = {
            projects: writeSnapshot,
            version: nextVersion
          };
          latestCloudVersionRef.current = nextVersion;
          latestCloudBaselineRef.current = writeSnapshot;
          setCloudVersion(nextVersion);
          setCloudSnapshotSignaturesByProjectId(createProjectSignatureMap(writeSnapshot));
          setCloudReadState("ok");
          setCloudReadSource("cloud-write");
          setCloudReadErrorMessage("");
          upsertSyncCacheEntryIfChanged({
            namespace: PROJECTS_SYNC_CACHE_NAMESPACE,
            userId: cloudUserId,
            payload: nextCachePayload,
            signature: getProjectCollectionCacheSignature(nextCachePayload)
          });
          return;
        }

        const { data: latestRow, error: latestReadError } = await supabase
          .from("user_projects")
          .select("projects,version")
          .eq("user_id", cloudUserId)
          .maybeSingle();

        if (latestReadError || !Array.isArray(latestRow?.projects)) {
          setDidCloudWriteFail(true);
          setCloudReadState("error");
          setCloudReadSource("write-version-conflict");
          setCloudReadErrorMessage("Version conflict detected and latest row could not be loaded.");
          return;
        }

        const latestProjects = sanitizeProjectList(latestRow.projects);
        const latestVersion = Number.isFinite(Number(latestRow.version)) ? Number(latestRow.version) : expectedVersion;
        const reconciledProjects = reconcileProjectCollections(writeBaseline, latestLocalProjectsRef.current, latestProjects);
        allowFollowUp = true;
        latestCloudVersionRef.current = latestVersion;
        latestCloudBaselineRef.current = latestProjects;
        latestLocalProjectsRef.current = reconciledProjects;
        setProjects(reconciledProjects);
        setCloudVersion(latestVersion);
        setCloudSnapshotSignaturesByProjectId(createProjectSignatureMap(latestProjects));
        setCloudReadState("error");
        setCloudReadSource("write-version-conflict-reloaded");
        setCloudReadErrorMessage("Another client updated projects first. Reconciled local and cloud projects.");
        const latestCachePayload = {
          projects: latestProjects,
          version: latestVersion
        };
        upsertSyncCacheEntryIfChanged({
          namespace: PROJECTS_SYNC_CACHE_NAMESPACE,
          userId: cloudUserId,
          payload: latestCachePayload,
          signature: getProjectCollectionCacheSignature(latestCachePayload)
        });
      })
      .finally(() => {
        cloudWriteInFlightRef.current = false;
        setIsCloudWriteInFlight(false);
        const coordinatorWasPending = projectWriteCoordinatorRef.current.finish();
        const needsFollowUp = allowFollowUp && (coordinatorWasPending || pendingCloudWriteRef.current ||
          !projectCollectionsEqual(latestLocalProjectsRef.current, writeSnapshot));
        pendingCloudWriteRef.current = false;
        if (needsFollowUp) setProjects([...latestLocalProjectsRef.current]);
      });
  }, [projects, cloudUserId, isCloudSyncReady]);

  const projectCloudSyncBadgesById = useMemo(
    () =>
      buildProjectCloudSyncBadges({
        projects,
        cloudSnapshotSignaturesByProjectId,
        hasSupabase: Boolean(supabase),
        cloudUserId,
        isCloudSyncReady,
        isCloudWriteInFlight,
        didCloudWriteFail
      }),
    [
      projects,
      cloudSnapshotSignaturesByProjectId,
      cloudUserId,
      isCloudSyncReady,
      isCloudWriteInFlight,
      didCloudWriteFail
    ]
  );

  const githubCategorySet = useMemo(() => new Set(GITHUB_COMPANY_CATEGORIES), []);
  const githubRepos = useMemo(
    () => projects.filter((project) => githubCategorySet.has(normalizeProjectCategory(project?.category))),
    [projects, githubCategorySet]
  );
  const areAllGitHubReposSynced = useMemo(() => {
    if (
      !supabase ||
      !cloudUserId ||
      !isCloudSyncReady ||
      !hasGitHubProviderToken ||
      isCloudWriteInFlight ||
      didCloudWriteFail
    ) {
      return false;
    }

    if (githubRepos.length === 0) {
      return false;
    }

    return githubRepos.every((project) => {
      const badge = projectCloudSyncBadgesById[String(project?.id || "")];
      return badge?.tone === "synced";
    });
  }, [
    cloudUserId,
    didCloudWriteFail,
    githubRepos,
    hasGitHubProviderToken,
    isCloudSyncReady,
    isCloudWriteInFlight,
    projectCloudSyncBadgesById
  ]);

  const visibleRepos = useMemo(() => getVisibleGitHubRepos(projects), [projects]);

  const startGitHubSignIn = async () => {
    if (!supabase) {
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();
    const redirectTo =
      typeof window !== "undefined"
        ? buildGitHubOAuthCallbackUrl(window.location.origin, process.env.NEXT_PUBLIC_BASE_PATH)
        : undefined;

    prepareGitHubOAuth(session);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo,
        scopes: "repo read:user"
      }
    });

    if (error) {
      clearGitHubProviderToken();
      throw new Error(error.message || "Unable to start GitHub sign-in.");
    }
  };

  const syncGitHubRepos = async () => {
    if (!supabase) {
      setGitHubSyncStatus("Supabase is not configured in this environment.");
      return;
    }

    if (isGitHubSyncing) {
      return;
    }

    setIsGitHubSyncing(true);
    setGitHubSyncStatus("Syncing repositories from GitHub...");
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;
      const providerToken = readGitHubProviderToken(session);

      if (!userId) {
        setGitHubSyncStatus("Redirecting to GitHub sign-in...");
        await startGitHubSignIn();
        return;
      }

      if (!providerToken) {
        setGitHubSyncStatus("GitHub access required. Redirecting to GitHub sign-in...");
        await startGitHubSignIn();
        return;
      }

      setHasGitHubProviderToken(true);
      const rawRepos = await fetchAllGitHubRepos(providerToken);
      const repos = rawRepos.filter(
        (repo) => Number(repo?.stargazers_count || 0) >= 1 && repo?.archived !== true
      );
      const now = Date.now();

      setProjects((previousProjects) => {
        const safePreviousProjects = sanitizeProjectList(previousProjects);
        const existingGitHubProjectsById = new Map(
          safePreviousProjects
            .filter(
              (project) =>
                String(project?.id || "").startsWith(GITHUB_REPO_PROJECT_ID_PREFIX) &&
                githubCategorySet.has(normalizeProjectCategory(project?.category))
            )
            .map((project) => [String(project.id), project])
        );

        const nonGitHubProjects = safePreviousProjects.filter((project) => {
          const projectId = String(project?.id || "");
          const category = normalizeProjectCategory(project?.category);
          return !projectId.startsWith(GITHUB_REPO_PROJECT_ID_PREFIX) || !githubCategorySet.has(category);
        });

        const syncedGitHubProjects = repos
          .map((repo) => {
            const repoId = Number(repo?.id);
            if (!Number.isFinite(repoId)) {
              return null;
            }

            const projectId = `${GITHUB_REPO_PROJECT_ID_PREFIX}${repoId}`;
            const existingProject = existingGitHubProjectsById.get(projectId);
            const pushedAtTimestamp = parseDateToTimestamp(repo?.pushed_at);
            const updatedAtTimestamp = parseDateToTimestamp(repo?.updated_at);

            return sanitizeProject({
              ...existingProject,
              id: projectId,
              category: existingProject?.category || GITHUB_CATEGORY_FALLBACK,
              title: String(repo?.name || "").trim(),
              desc: String(repo?.description || "").trim(),
              repoUrl: normalizeOptionalUrl(repo?.html_url),
              completionStatus: PROJECT_STATUS_ACTIVE,
              repoStatusTag: REPO_STATUS_TAG_ACTIVE,
              isArchived: false,
              stargazersCount: Number(repo?.stargazers_count || 0),
              lastCommitAt: pushedAtTimestamp ?? updatedAtTimestamp ?? null,
              updatedAt: now,
              createdAt: existingProject?.createdAt || now
            });
          })
          .filter(Boolean);

        return [...syncedGitHubProjects, ...nonGitHubProjects];
      });

      setGitHubSyncStatus(`Synced ${repos.length} repositories.`);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 401) {
        clearGitHubProviderToken();
        setHasGitHubProviderToken(false);
        setGitHubSyncStatus("GitHub authorization expired. Redirecting to reconnect...");
        await startGitHubSignIn();
        return;
      }

      const message = String(error?.message || "GitHub sync failed.");
      setGitHubSyncStatus(message);
    } finally {
      setIsGitHubSyncing(false);
    }
  };

  useEffect(() => {
    onProjectsChange?.({ projects, userId: cloudUserId });
  }, [cloudUserId, onProjectsChange, projects]);

  return {
    areAllGitHubReposSynced,
    githubSyncStatus,
    isGitHubSyncing,
    syncGitHubRepos,
    visibleRepos
  };
}

export default function GitHubReposModule({ onProjectsChange }) {
  const {
    areAllGitHubReposSynced,
    githubSyncStatus,
    isGitHubSyncing,
    syncGitHubRepos,
    visibleRepos
  } = useGitHubProjectSync({ onProjectsChange });

  return (
    <section className="coding-workspace">
      <section className="coding-board-modal">
          <header className="coding-board-header">
            <h2 className="coding-board-title">Programming</h2>
            <div className="coding-board-actions">
              <button
                type="button"
                className={`coding-github-sync-btn ${areAllGitHubReposSynced ? "is-synced" : ""}`}
                onClick={syncGitHubRepos}
                disabled={isGitHubSyncing}
              >
                {isGitHubSyncing ? "Syncing..." : "Sync GitHub Repos"}
              </button>
            </div>
          </header>

          {githubSyncStatus ? <p className="coding-github-sync-status">{githubSyncStatus}</p> : null}

          <section className="coding-repos-module">
            <div className="coding-repos-header">
              <h3 className="coding-repos-title">Repos</h3>
              <p className="coding-repos-count">{visibleRepos.length}</p>
            </div>
            <div className="coding-repos-list">
              {visibleRepos.length === 0 ? (
                <p className="coding-repos-empty">No active repositories.</p>
              ) : (
                visibleRepos.map((project) => (
                  <RepoCard key={project.id} project={project} />
                ))
              )}
            </div>
          </section>
      </section>
    </section>
  );
}

function RepoCard({ project }) {
  const formattedLastCommit = formatLastCommitDateTime(project?.lastCommitAt);
  const lastCommitTone = getLastCommitRecencyTone(project?.lastCommitAt);
  const relativeAge = formatLastCommitRelativeNumber(project?.lastCommitAt);

  return (
    <article className="coding-repo-card">
      <div className="coding-repo-card-header">
        <h4 className="coding-repo-title">{project?.title || "Untitled Repo"}</h4>
      </div>
      <div className="coding-repo-meta-row">
        <p className={`coding-repo-last-commit is-${lastCommitTone}`}>
          Last commit: {formattedLastCommit || "Unknown"}
        </p>
        {relativeAge ? <span className={`coding-repo-age-chip is-${lastCommitTone}`}>{relativeAge}</span> : null}
      </div>
    </article>
  );
}

function buildProjectCloudSyncBadges({
  projects,
  cloudSnapshotSignaturesByProjectId,
  hasSupabase,
  cloudUserId,
  isCloudSyncReady,
  isCloudWriteInFlight,
  didCloudWriteFail
}) {
  const badgeByProjectId = {};
  const safeProjects = Array.isArray(projects) ? projects : [];

  safeProjects.forEach((project) => {
    const projectId = String(project?.id || "");

    if (!hasSupabase || !cloudUserId) {
      badgeByProjectId[projectId] = { label: "Local", tone: "local" };
      return;
    }

    if (!isCloudSyncReady) {
      badgeByProjectId[projectId] = { label: "Syncing", tone: "syncing" };
      return;
    }

    if (didCloudWriteFail) {
      badgeByProjectId[projectId] = { label: "Retry", tone: "error" };
      return;
    }

    const cloudSnapshotSignature = cloudSnapshotSignaturesByProjectId?.[projectId];
    const currentProjectSignature = getProjectSyncSignature(project);

    if (!cloudSnapshotSignature) {
      badgeByProjectId[projectId] = { label: "Local only", tone: "local" };
      return;
    }

    if (cloudSnapshotSignature !== currentProjectSignature || isCloudWriteInFlight) {
      badgeByProjectId[projectId] = { label: "Pending", tone: "pending" };
      return;
    }

    badgeByProjectId[projectId] = { label: "Synced", tone: "synced" };
  });

  return badgeByProjectId;
}

function sanitizeProject(project) {
  if (!project || typeof project !== "object") {
    return null;
  }

  const title = String(project.title || "").trim();
  if (!title) {
    return null;
  }

  const now = Date.now();
  return {
    id: String(project.id || createProjectId()),
    category: normalizeProjectCategory(project.category),
    title,
    desc: String(project.desc || "").trim(),
    repoUrl: normalizeOptionalUrl(project.repoUrl),
    dueDate: normalizeProjectDateTimeInput(project.dueDate),
    estimatedHours: normalizeEstimatedHours(project.estimatedHours),
    completionStatus: normalizeProjectCompletionStatus(project.completionStatus),
    repoStatusTag: normalizeRepoStatusTag(project.repoStatusTag),
    isArchived: normalizeBooleanFlag(project.isArchived),
    stargazersCount: Number.isFinite(Number(project.stargazersCount)) ? Number(project.stargazersCount) : null,
    lastCommitAt: normalizeOptionalTimestamp(project.lastCommitAt),
    createdAt: Number.isFinite(Number(project.createdAt)) ? Number(project.createdAt) : now,
    updatedAt: Number.isFinite(Number(project.updatedAt)) ? Number(project.updatedAt) : now
  };
}

function sanitizeProjectList(rawProjects) {
  if (!Array.isArray(rawProjects)) {
    return [];
  }

  return rawProjects
    .map((project) => sanitizeProject(project))
    .filter((project) => {
      if (!project) return false;
      if (
        project.id.startsWith(GITHUB_REPO_PROJECT_ID_PREFIX) &&
        ((project.stargazersCount !== null && project.stargazersCount <= 0) || project.isArchived)
      ) {
        return false;
      }
      return true;
    });
}

function getProjectSyncSignature(project) {
  const sanitizedProject = sanitizeProject(project);
  if (!sanitizedProject) {
    return "";
  }

  return JSON.stringify({
    id: sanitizedProject.id,
    category: sanitizedProject.category,
    title: sanitizedProject.title,
    desc: sanitizedProject.desc,
    repoUrl: sanitizedProject.repoUrl,
    dueDate: sanitizedProject.dueDate,
    estimatedHours: sanitizedProject.estimatedHours,
    completionStatus: sanitizedProject.completionStatus,
    repoStatusTag: sanitizedProject.repoStatusTag,
    isArchived: sanitizedProject.isArchived,
    lastCommitAt: sanitizedProject.lastCommitAt,
    createdAt: sanitizedProject.createdAt,
    updatedAt: sanitizedProject.updatedAt
  });
}

function createProjectSignatureMap(projectList) {
  const signatureMap = {};
  const safeProjects = Array.isArray(projectList) ? projectList : [];

  safeProjects.forEach((project) => {
    const projectId = String(project?.id || "");
    if (!projectId) {
      return;
    }

    signatureMap[projectId] = getProjectSyncSignature(project);
  });

  return signatureMap;
}

function readProjectsFromStorage() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return sanitizeProjectList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeProjectsToStorage(projectList) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(sanitizeProjectList(projectList)));
}

function getProjectCollectionCacheSignature(cachePayload) {
  const safePayload = cachePayload && typeof cachePayload === "object" ? cachePayload : {};
  const safeProjects = sanitizeProjectList(safePayload.projects);
  const safeVersion = Number.isFinite(Number(safePayload.version)) ? Number(safePayload.version) : null;
  return JSON.stringify({
    version: safeVersion,
    projects: safeProjects.map((project) => getProjectSyncSignature(project))
  });
}

function normalizeProjectCategory(rawValue) {
  const category = String(rawValue || "").trim();

  const allowed = new Set(ALL_COMPANY_CATEGORIES);
  if (allowed.has(category)) {
    return category;
  }

  const mappedLegacyCategory = LEGACY_CATEGORY_TO_COMPANY[category];
  if (mappedLegacyCategory && allowed.has(mappedLegacyCategory)) {
    return mappedLegacyCategory;
  }

  return CATEGORY_FALLBACK;
}

function normalizeProjectDateTimeInput(rawValue) {
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return "";
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return normalized;
}

function normalizeEstimatedHours(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return "";
  }

  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    return "";
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "";
  }

  return String(parsed);
}

function normalizeProjectCompletionStatus(rawValue) {
  const normalized = String(rawValue || "")
    .trim()
    .toLowerCase();
  if (normalized === PROJECT_STATUS_COMPLETED) {
    return PROJECT_STATUS_COMPLETED;
  }
  return PROJECT_STATUS_ACTIVE;
}

function normalizeRepoStatusTag(rawValue) {
  return String(rawValue || "").trim().toLowerCase() || REPO_STATUS_TAG_ACTIVE;
}

function normalizeBooleanFlag(rawValue) {
  return rawValue === true;
}

function normalizeOptionalTimestamp(rawValue) {
  const numericValue = Number(rawValue);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const parsedDate = parseDateToTimestamp(rawValue);
  if (Number.isFinite(parsedDate)) {
    return parsedDate;
  }

  return null;
}

function normalizeOptionalUrl(rawValue) {
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return "";
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return "";
  }

  return normalized;
}

function parseDateToTimestamp(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.getTime();
}

function createProjectId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLastCommitRecencyTone(lastCommitAt) {
  const timestamp = Number(lastCommitAt);
  if (!Number.isFinite(timestamp)) {
    return "info";
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const twoWeeksMs = 14 * dayMs;
  const threeMonthsMs = 90 * dayMs;
  const ageMs = Math.max(0, Date.now() - timestamp);

  if (ageMs <= 3 * dayMs) {
    return "recent";
  }

  if (ageMs <= weekMs) {
    return "info";
  }

  if (ageMs <= twoWeeksMs) {
    return "warning";
  }

  if (ageMs <= threeMonthsMs) {
    return "major";
  }

  return "danger";
}

function formatLastCommitDateTime(lastCommitAt) {
  const timestamp = Number(lastCommitAt);
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  try {
    return new Date(timestamp).toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function formatLastCommitRelativeNumber(lastCommitAt) {
  const timestamp = Number(lastCommitAt);
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const ageMs = Math.max(0, Date.now() - timestamp);
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;

  const days = Math.floor(ageMs / dayMs);
  if (days > 0) {
    return `${days}d`;
  }

  const hours = Math.floor(ageMs / hourMs);
  if (hours > 0) {
    return `${hours}h`;
  }

  const minutes = Math.floor(ageMs / minuteMs);
  return `${Math.max(0, minutes)}m`;
}

async function fetchAllGitHubRepos(providerToken) {
  const allRepos = [];
  let page = 1;

  while (page <= 50) {
    const response = await fetch(
      `https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${providerToken}`,
          Accept: "application/vnd.github+json"
        }
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new GitHubApiError(response.status, errorBody);
    }

    const reposPage = await response.json();
    if (!Array.isArray(reposPage)) {
      throw new Error("Unexpected GitHub response payload.");
    }

    allRepos.push(...reposPage);
    if (reposPage.length < 100) {
      break;
    }

    page += 1;
  }

  return allRepos;
}

class GitHubApiError extends Error {
  constructor(status, responseBody) {
    super(`GitHub API ${status}: ${responseBody || "request failed"}`);
    this.name = "GitHubApiError";
    this.status = status;
  }
}
