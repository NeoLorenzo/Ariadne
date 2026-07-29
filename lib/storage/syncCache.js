"use client";

const SYNC_CACHE_STORAGE_KEY = "fabbro_sync_cache_v1";
const LAST_SYNC_USER_STORAGE_KEY = "fabbro_sync_cache_last_user_v1";

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
    return;
  }

  try {
    window.localStorage.setItem(SYNC_CACHE_STORAGE_KEY, JSON.stringify(store || {}));
  } catch {
    // Ignore cache persistence errors.
  }
}

function buildSyncCacheEntryKey(namespace, userId) {
  return `${String(namespace || "").trim()}::${String(userId || "").trim()}`;
}

function buildSyncCacheSignature(payload) {
  try {
    return JSON.stringify(payload ?? null);
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

  const nextSignature = String(signature || buildSyncCacheSignature(payload));
  if (!nextSignature) {
    return { changed: false, signature: "" };
  }

  const store = readSyncCacheStore();
  const key = buildSyncCacheEntryKey(namespace, userId);
  const previousEntry = store[key];
  const previousSignature = String(previousEntry?.signature || "");

  if (previousSignature === nextSignature) {
    return { changed: false, signature: nextSignature };
  }

  store[key] = {
    payload: payload ?? null,
    signature: nextSignature,
    updatedAt: Date.now()
  };
  writeSyncCacheStore(store);
  return { changed: true, signature: nextSignature };
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
