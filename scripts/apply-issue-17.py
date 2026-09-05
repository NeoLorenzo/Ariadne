from pathlib import Path


def replace_once(path, old, new):
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:80]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "lib/tasks/reconcile.js",
    'function getDirectionalGoalId(task) {',
    'export function getDirectionalGoalId(task) {'
)
replace_once(
    "lib/tasks/reconcile.js",
    'priority: directionalGoalId ? 1 : normalizePriority(task.priority)',
    'priority: directionalGoalId ? 0 : normalizePriority(task.priority)'
)

replace_once(
    "lib/tasks/goalTaskSync.js",
    '    priority: 1,',
    '    priority: 0,'
)

replace_once(
    "lib/tasks/taskOrdering.js",
    'import { isTaskDeleted } from "@/lib/tasks/taskTombstones";\n',
    'import { isTaskDeleted } from "@/lib/tasks/taskTombstones";\nimport { getDirectionalGoalId } from "./reconcile";\n'
)
replace_once(
    "lib/tasks/taskOrdering.js",
    '''function sortTasksByPriority(first, second) {\n  const firstPriority = normalizePriority(first?.priority, first?.materialConsequence);\n  const secondPriority = normalizePriority(second?.priority, second?.materialConsequence);\n  if (firstPriority !== secondPriority) {\n    if (firstPriority === 0) return 1;\n    if (secondPriority === 0) return -1;\n    return firstPriority - secondPriority;\n  }\n  return sortTasksByDueDate(first, second);\n}\n''',
    '''function sortTasksByPriority(first, second) {\n  const firstDirectional = Boolean(getDirectionalGoalId(first));\n  const secondDirectional = Boolean(getDirectionalGoalId(second));\n  if (firstDirectional !== secondDirectional) {\n    return firstDirectional ? -1 : 1;\n  }\n\n  const firstPriority = normalizePriority(first?.priority, first?.materialConsequence);\n  const secondPriority = normalizePriority(second?.priority, second?.materialConsequence);\n  if (firstPriority !== secondPriority) {\n    if (firstPriority === 0) return 1;\n    if (secondPriority === 0) return -1;\n    return firstPriority - secondPriority;\n  }\n  return sortTasksByDueDate(first, second);\n}\n'''
)

replace_once(
    "app/tasks/page.js",
    '      priority: form.sourceGoalId ? 1 : normalizePriority(form.priority),',
    '      priority: form.sourceGoalId ? 0 : normalizePriority(form.priority),'
)
replace_once(
    "app/tasks/page.js",
    '      priority: directionalGoalId ? 1 : normalizePriority(task.priority, task.materialConsequence),',
    '      priority: directionalGoalId ? 0 : normalizePriority(task.priority, task.materialConsequence),'
)
replace_once(
    "app/tasks/page.js",
    '<span className="task-card-goal-tag">◆ Directional goal</span>',
    '<span className="task-card-goal-tag">D · Directional</span>'
)
replace_once(
    "app/tasks/page.js",
    '''                    >\n                      <option value="0">0 · No priority</option>''',
    '''                    >\n                      {form.sourceGoalId ? <option value={form.priority}>D · Directional</option> : null}\n                      <option value="0">0 · No priority</option>'''
)

reconcile_test = Path("lib/tasks/reconcile.test.js")
text = reconcile_test.read_text(encoding="utf-8")
needle = '''  it("retains rich task data and invalid input is safe", () => {\n'''
addition = '''  it("derives directional status without persisting the legacy P1 coercion", () => {\n    const [directional] = sanitizeTaskList([\n      task("directional-goal-task-goal-1", "Direction-linked", 2, {\n        priority: 1,\n        sourceGoalId: "goal-1"\n      })\n    ]);\n\n    expect(directional.priority).toBe(0);\n    expect(directional.sourceGoalId).toBe("goal-1");\n    expect(directional.sourceType).toBe("directional-goal");\n    expect(directional.tags).toEqual(["directional-goal"]);\n\n    const reconciled = reconcileTaskSnapshots([directional], [directional], baseline([directional]));\n    expect(reconciled[0].priority).toBe(0);\n    expect(reconciled[0].sourceGoalId).toBe("goal-1");\n  });\n'''
if text.count(needle) != 1:
    raise RuntimeError("Could not locate reconcile test insertion point")
reconcile_test.write_text(text.replace(needle, addition + needle, 1), encoding="utf-8")

Path("lib/tasks/taskOrdering.test.js").write_text('''import { describe, expect, it } from "vitest";\nimport { orderTasksForDisplay } from "./taskOrdering";\n\nfunction task(id, priority, extra = {}) {\n  return { id, title: id, priority, createdAt: 1, ...extra };\n}\n\ndescribe("task priority ordering", () => {\n  it("orders Directional before P1 through P4 and no priority", () => {\n    const tasks = [\n      task("none", 0),\n      task("p4", 4),\n      task("p2", 2),\n      task("directional", 0, { sourceGoalId: "goal-1" }),\n      task("p1", 1),\n      task("p3", 3)\n    ];\n\n    expect(orderTasksForDisplay(tasks, "priority").map((item) => item.id)).toEqual([\n      "directional",\n      "p1",\n      "p2",\n      "p3",\n      "p4",\n      "none"\n    ]);\n  });\n\n  it("keeps due-date tie-breaking inside the directional group", () => {\n    const tasks = [\n      task("later", 0, { sourceGoalId: "goal-2", dueDate: "2026-09-10" }),\n      task("earlier", 0, { sourceGoalId: "goal-1", dueDate: "2026-09-08" })\n    ];\n\n    expect(orderTasksForDisplay(tasks, "priority").map((item) => item.id)).toEqual([\n      "earlier",\n      "later"\n    ]);\n  });\n});\n''', encoding="utf-8")
