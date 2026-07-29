"use client";

import { supabase } from "@/lib/supabase/client";

export const LORENZO_ROQUE_SUBSTACK_SIGNAL_KEY = "lorenzo-roque-substack";

export async function loadCachedSubstackSignal() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("external_signal_cache")
    .select("signal_key,latest_entry_at,latest_entry_title,latest_entry_url,source,checked_at,updated_at")
    .eq("signal_key", LORENZO_ROQUE_SUBSTACK_SIGNAL_KEY)
    .maybeSingle();
  return error ? null : normalizeSignalRow(data);
}

export async function recordClientDetectedSubstackSignal(entry) {
  const normalizedEntry = normalizeDetectedEntry(entry);
  if (!supabase || !normalizedEntry) return null;
  const { data, error } = await supabase.rpc("record_external_signal_if_newer", {
    p_signal_key: LORENZO_ROQUE_SUBSTACK_SIGNAL_KEY,
    p_latest_entry_at: normalizedEntry.publishedAt,
    p_latest_entry_title: normalizedEntry.title,
    p_latest_entry_url: normalizedEntry.url,
    p_source: "client-detection"
  });
  return error ? null : normalizeSignalRow(data);
}

export async function requestServerSubstackRefresh() {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke("refresh-substack-signal", {
    body: { signalKey: LORENZO_ROQUE_SUBSTACK_SIGNAL_KEY }
  });
  return error ? null : normalizeSignalRow(data?.signal || data);
}

function normalizeDetectedEntry(entry) {
  const publishedAt = String(entry?.publishedAt || "").trim();
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return null;
  return {
    publishedAt: new Date(timestamp).toISOString(),
    title: String(entry?.title || "").trim(),
    url: String(entry?.url || "").trim()
  };
}

function normalizeSignalRow(row) {
  if (!row || typeof row !== "object") return null;
  const publishedAt = String(row.latest_entry_at || row.latestEntryAt || "").trim();
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return null;
  return {
    signalKey: String(row.signal_key || row.signalKey || ""),
    publishedAt: new Date(timestamp).toISOString(),
    publishedAtTimestamp: timestamp,
    title: String(row.latest_entry_title || row.latestEntryTitle || ""),
    url: String(row.latest_entry_url || row.latestEntryUrl || ""),
    source: String(row.source || ""),
    checkedAt: row.checked_at || row.checkedAt || null,
    updatedAt: row.updated_at || row.updatedAt || null
  };
}
