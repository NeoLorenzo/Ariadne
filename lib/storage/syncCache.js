"use client";

const SYNC_CACHE_STORAGE_KEY = "fabbro_sync_cache_v1";
const LAST_SYNC_USER_STORAGE_KEY = "fabbro_sync_cache_last_user_v1";
const COMPACT_SIGNATURE_PREFIX = "v1";

function readSyncCacheStore() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SYNC_CACHE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSyncCacheStore(store) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(SYNC_CACHE_STORAGE_KEY, JSON.stringify(store || {}));
    return true;
  } catch {
    // The sync cache is a resilience optimization only. A browser-storage
    // quota failure must never interrupt the authoritative cloud workflow.
    return false;
  }
}

function buildSyncCacheEntryKey(namespace, userId) {
  return `${String(namespace || "").trim()}::${String(userId || "").trim()}`;
}

function hashSignatureText(value, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function compactSyncCacheSignature(value) {
  const source = String(value || "");
  if (!source) {
    return "";
  }

  const compactPattern = /^v1:\d+:[0-9a-f]{8}:[0-9a-f]{8}$/;
  if (compactPattern.test(source)) {
    return source;
  }

  return `${COMPACT_SIGNATURE_PREFIX}:${source.length}:${hashSignatureText(source, 2166136261)}:${hashSignatureText(source, 3339675911)}`;
}

function buildSyncCacheSignature(payload) {
  try {
    return compactSyncCacheSignature(JSON.stringify(payload ?? null));
  } catch {
    return "";
  }
}

export function readSyncCacheEntry({ namespace, userId }) {
  if (!namespace || !userId) {
    return null;
  }

  const store = readSyncCacheStore();
  const key = buildSyncCacheEntryKey(namespace, userId);
  const entry = store[key];
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    payload: entry.payload ?? null,
    signature: String(entry.signature || ""),
    updatedAt: Number(entry.updatedAt) || 0
  };
}

export function upsertSyncCacheEntryIfChanged({ namespace, userId, payload, signature }) {
  if (!namespace || !userId) {
    return { changed: false, signature: "" };
  }

  const nextSignature = compactSyncCacheSignature(signature || buildSyncCacheSignature(payload));
  if (!nextSignature) {
    return { changed: false, signature: "" };
  }

  const store = readSyncCacheStore();
  const key = buildSyncCacheEntryKey(namespace, userId);
  const previousEntry = store[key];
  const previousStoredSignature = String(previousEntry?.signature || "");
  const previousSignature = compactSyncCacheSignature(previousStoredSignature);
  const hasLegacyExpandedSignature = Boolean(
    previousStoredSignature && previousStoredSignature !== previousSignature
  );

  if (previousSignature === nextSignature && !hasLegacyExpandedSignature) {
    return { changed: false, signature: nextSignature };
  }

  store[key] = {
    payload: payload ?? null,
    signature: nextSignature,
    updatedAt: Date.now()
  };
  const changed = writeSyncCacheStore(store);
  return { changed, signature: nextSignature };
}

export function clearAllSyncCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(SYNC_CACHE_STORAGE_KEY);
    window.localStorage.removeItem(LAST_SYNC_USER_STORAGE_KEY);
  } catch {
    // Ignore cache clear errors.
  }
}

export function readLastKnownSyncUserId() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LAST_SYNC_USER_STORAGE_KEY);
    const value = String(raw || "").trim();
    return value || null;
  } catch {
    return null;
  }
}

export function writeLastKnownSyncUserId(userId) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const value = String(userId || "").trim();
    if (!value) {
      window.localStorage.removeItem(LAST_SYNC_USER_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(LAST_SYNC_USER_STORAGE_KEY, value);
  } catch {
    // Ignore cache user marker errors.
  }
}
