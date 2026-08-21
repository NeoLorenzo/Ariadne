import { loadStrategicObjectives } from "@/lib/objectives/strategicObjectiveRepository";
import { loadOutcomeGoals } from "@/lib/goals/outcomeGoalRepository";
import { getGoalTiming } from "@/lib/goals/goalTiming";

export async function loadDirectionSummaryStats(directionId, userId) {
  if (!directionId) {
    return { activeObjectivesCount: 0, activeGoalsCount: 0, overdueCount: 0, completedCount: 0 };
  }

  try {
    const objectives = await loadStrategicObjectives(directionId, userId);
    const activeObjs = (objectives || []).filter((item) => item.status === "active");

    let activeGoalsCount = 0;
    let overdueCount = 0;
    let completedCount = 0;

    const goalPromises = activeObjs.map((obj) => loadOutcomeGoals(obj.id, userId));
    const goalLists = await Promise.all(goalPromises);

    goalLists.forEach((goals) => {
      (goals || []).forEach((goal) => {
        if (goal.status === "active") {
          activeGoalsCount += 1;
          const timing = getGoalTiming(goal);
          if (timing?.tone === "overdue") {
            overdueCount += 1;
          }
        } else if (goal.status === "completed") {
          completedCount += 1;
        }
      });
    });

    return {
      activeObjectivesCount: activeObjs.length,
      activeGoalsCount,
      overdueCount,
      completedCount
    };
  } catch {
    return { activeObjectivesCount: 0, activeGoalsCount: 0, overdueCount: 0, completedCount: 0 };
  }
}
