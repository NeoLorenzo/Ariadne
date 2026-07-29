const DAY_MS = 24 * 60 * 60 * 1000;

export function getGoalTiming(goal, now = new Date()) {
  const todayDay = getLocalCalendarDay(now);
  const startDay = parseDateInputDay(goal?.startDate);
  const targetDay = parseDateInputDay(goal?.targetDate);

  if (startDay !== null && startDay > todayDay) {
    const daysUntilStart = startDay - todayDay;
    return {
      label: `Starts in ${formatDayCount(daysUntilStart)}`,
      tone: "upcoming"
    };
  }

  if (targetDay === null) {
    return {
      label: "No deadline",
      tone: "unscheduled"
    };
  }

  const daysUntilTarget = targetDay - todayDay;
  if (daysUntilTarget > 0) {
    return {
      label: `${formatDayCount(daysUntilTarget)} left`,
      tone: "active"
    };
  }
  if (daysUntilTarget === 0) {
    return {
      label: "Due today",
      tone: "due"
    };
  }

  return {
    label: `${formatDayCount(Math.abs(daysUntilTarget))} overdue`,
    tone: "overdue"
  };
}

export function getGoalOutcomeStatus(goal, now = new Date()) {
  const todayDay = getLocalCalendarDay(now);
  const targetDay = parseDateInputDay(goal?.targetDate);

  if (targetDay === null || targetDay > todayDay) {
    return "active";
  }

  const currentValue = normalizeCount(goal?.currentValue, 0);
  const targetValue = normalizeCount(goal?.targetValue, 1);
  const bareMinimum = Math.min(
    normalizeCount(goal?.bareMinimum, 0),
    targetValue
  );

  if (currentValue > targetValue) {
    return "exceptional";
  }
  if (currentValue === targetValue) {
    return "completed";
  }
  if (currentValue >= bareMinimum) {
    return "partially-completed";
  }
  return "failed";
}

export function compareGoalsByDueDate(left, right) {
  const leftTargetDay = parseDateInputDay(left?.targetDate);
  const rightTargetDay = parseDateInputDay(right?.targetDate);

  if (leftTargetDay === null && rightTargetDay !== null) {
    return 1;
  }
  if (leftTargetDay !== null && rightTargetDay === null) {
    return -1;
  }
  if (leftTargetDay !== rightTargetDay) {
    return leftTargetDay - rightTargetDay;
  }

  return Number(left?.position || 0) - Number(right?.position || 0);
}

function parseDateInputDay(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, monthIndex, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(timestamp / DAY_MS);
}

function getLocalCalendarDay(value) {
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
  );
}

function formatDayCount(value) {
  return `${value} day${value === 1 ? "" : "s"}`;
}

function normalizeCount(value, minimum) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return minimum;
  }
  return Math.max(minimum, Math.trunc(numericValue));
}
