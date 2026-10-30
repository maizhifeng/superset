/**
 * Human-friendly Chinese descriptions for the five-field cron expressions the
 * briefing scheduler stores. Falls back to ``null`` for expressions that need
 * a full cron descriptor so callers can show the raw expression instead.
 */

const WEEKDAY_LABELS: Record<number, string> = {
  0: "周日",
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

const isNumber = (value: string) => /^\d{1,2}$/.test(value);

/** Format a cron expression as e.g. ``每天 09:00`` / ``每周一 08:30``. */
export function formatCrontabZh(
  expression: string | null | undefined,
): string | null {
  const fields = expression?.trim().split(/\s+/);
  if (!fields || fields.length !== 5) return null;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  if (
    minute === "*" &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return "每分钟";
  }

  if (!isNumber(minute) || !isNumber(hour)) return null;
  const minutes = Number(minute);
  const hours = Number(hour);
  if (minutes > 59 || hours > 23) return null;
  const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  if (month !== "*") return null;

  if (dayOfMonth === "*" && dayOfWeek === "*") return `每天 ${time}`;

  if (dayOfMonth === "*" && /^\d$/.test(dayOfWeek)) {
    const label = WEEKDAY_LABELS[Number(dayOfWeek)];
    return label ? `每${label} ${time}` : null;
  }

  if (dayOfWeek === "*" && isNumber(dayOfMonth)) {
    return `每月 ${Number(dayOfMonth)} 日 ${time}`;
  }

  return null;
}
