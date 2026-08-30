function signature(value) {
  return JSON.stringify(value, Object.keys(value || {}).sort());
}

function byId(projects) {
  return new Map((Array.isArray(projects) ? projects : []).map((project) => [String(project.id), project]));
}

export function reconcileProjectCollections(baseline, local, remote) {
  const base = byId(baseline);
  const mine = byId(local);
  const theirs = byId(remote);
  const result = [];
  const seen = new Set();

  for (const project of Array.isArray(remote) ? remote : []) {
    const id = String(project.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const b = base.get(id);
    const l = mine.get(id);
    const r = theirs.get(id);
    const localChanged = b === undefined ? l !== undefined : l === undefined || signature(l) !== signature(b);
    const remoteChanged = b === undefined ? r !== undefined : r === undefined || signature(r) !== signature(b);
    if (localChanged) { if (l !== undefined) result.push(l); }
    else if (remoteChanged) { if (r !== undefined) result.push(r); }
    else if (l !== undefined) result.push(l);
  }

  for (const project of Array.isArray(local) ? local : []) {
    const id = String(project.id);
    if (seen.has(id)) continue;
    seen.add(id);
    // Local additions and deletions are intentional local state.
    if (!base.has(id)) result.push(project);
  }
  return result;
}

export function projectCollectionsEqual(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}
