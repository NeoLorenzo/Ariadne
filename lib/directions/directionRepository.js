import { supabase } from "@/lib/supabase/client";

const STORAGE_KEY = "fabbro_direction_v1";
const EMPTY_STATE = () => ({ direction: null, revisions: [] });

function makeId(prefix) {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function readLocalState() {
  if (typeof window === "undefined") return EMPTY_STATE();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (
      parsed?.direction?.id &&
      typeof parsed.direction.title === "string" &&
      parsed.direction.title.trim() &&
      typeof parsed.direction.statement === "string" &&
      parsed.direction.statement.trim() &&
      Array.isArray(parsed.revisions)
    ) return parsed;
  } catch {
    // A damaged local snapshot should not prevent the dashboard from loading.
  }
  return EMPTY_STATE();
}

function writeLocalState(state) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function fromDirectionRow(row) {
  return {
    id: row.id,
    title: row.title,
    statement: row.statement,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function fromRevisionRow(row) {
  return {
    id: row.id,
    directionId: row.direction_id,
    title: row.title,
    statement: row.statement,
    changeReason: row.change_reason || "",
    createdAt: row.created_at
  };
}

export async function loadDirectionState(userId) {
  const localState = readLocalState();
  if (!supabase || !userId) return localState;

  const { data: directionRow, error } = await supabase
    .from("directions")
    .select("id,title,statement,is_active,created_at,updated_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return localState;
  if (!directionRow) {
    return localState;
  }

  const { data: revisionRows, error: revisionError } = await supabase
    .from("direction_revisions")
    .select("id,direction_id,title,statement,change_reason,created_at")
    .eq("user_id", userId)
    .eq("direction_id", directionRow.id)
    .order("created_at", { ascending: false });

  const state = {
    direction: fromDirectionRow(directionRow),
    revisions: revisionError ? localState.revisions : (revisionRows || []).map(fromRevisionRow)
  };
  writeLocalState(state);
  return state;
}

export async function createDirection({ title, statement, userId, onLocalUpdate }) {
  const trimmedTitle = title.trim();
  const trimmedStatement = statement.trim();
  if (!trimmedTitle || !trimmedStatement) {
    throw new Error("DIRECTION_TITLE_AND_STATEMENT_REQUIRED");
  }

  const createdAt = new Date().toISOString();
  const nextState = {
    direction: {
      id: makeId("direction"),
      title: trimmedTitle,
      statement: trimmedStatement,
      isActive: true,
      createdAt,
      updatedAt: createdAt
    },
    revisions: []
  };

  writeLocalState(nextState);
  onLocalUpdate?.(nextState);
  if (supabase && userId) {
    const { error } = await supabase.from("directions").insert({
      id: nextState.direction.id,
      user_id: userId,
      title: nextState.direction.title,
      statement: nextState.direction.statement,
      is_active: true
    });
    if (error) throw error;
  }
  return nextState;
}

export async function updateDirection({ direction, revisions, title, statement, changeReason, userId, onLocalUpdate }) {
  const changedAt = new Date().toISOString();
  const revision = {
    id: makeId("direction-revision"),
    directionId: direction.id,
    title: direction.title,
    statement: direction.statement,
    changeReason: changeReason.trim(),
    createdAt: changedAt
  };
  const nextState = {
    direction: { ...direction, title: title.trim(), statement: statement.trim(), updatedAt: changedAt },
    revisions: [revision, ...revisions]
  };

  writeLocalState(nextState);
  onLocalUpdate?.(nextState);
  if (supabase && userId) {
    const { error } = await supabase.rpc("update_direction_semantic", {
      direction_id: direction.id,
      patch: {
        title: nextState.direction.title,
        statement: nextState.direction.statement
      },
      change_reason: revision.changeReason || null
    });
    if (error) throw error;
  }
  return nextState;
}

export async function deleteDirectionRevision({
  direction,
  revisions,
  revisionId,
  userId,
  onLocalUpdate
}) {
  const nextState = {
    direction,
    revisions: revisions.filter((revision) => revision.id !== revisionId)
  };

  writeLocalState(nextState);
  onLocalUpdate?.(nextState);

  if (supabase && userId) {
    const { data, error } = await supabase
      .from("direction_revisions")
      .delete()
      .eq("id", revisionId)
      .eq("user_id", userId)
      .eq("direction_id", direction.id)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("DIRECTION_REVISION_DELETE_NOT_CONFIRMED");
  }

  return nextState;
}
