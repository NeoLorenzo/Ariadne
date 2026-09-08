import { loadStrategicObjectives } from "@/lib/objectives/strategicObjectiveRepository";

export async function loadDirectionSummaryStats(directionId, userId) {
  if (!directionId) {
    return { activeObjectivesCount: 0 };
  }

  try {
    const objectives = await loadStrategicObjectives(directionId, userId);
    return {
      activeObjectivesCount: (objectives || []).filter((item) => item.status === "active").length
    };
  } catch {
    return { activeObjectivesCount: 0 };
  }
}
