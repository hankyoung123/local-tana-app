import type { NodeId, TanaTime } from './types';

/** A stable, timezone-free calendar-day identity shared by Day Nodes and Date Fields. */
export type TanaDay = `${number}-${number}-${number}`;

export type TanaDayParts = {
  day: number;
  /** ISO-8601 week number, with Monday as the first day of the week. */
  week: number;
  month: number;
  year: number;
};

function toUtcDate(day: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);

  if (!match) return;

  const [, yearText, monthText, dateText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const date = Number(dateText);
  const result = new Date(Date.UTC(year, month - 1, date));

  return result.getUTCFullYear() === year &&
    result.getUTCMonth() === month - 1 &&
    result.getUTCDate() === date
    ? result
    : undefined;
}

/** Rejects partial or rollover dates so every consumer receives one day identity. */
export function isTanaDay(value: unknown): value is TanaDay {
  return typeof value === 'string' && !!toUtcDate(value);
}

/** Formats a Date in the user's local calendar, deliberately avoiding UTC day rollover. */
export function getTanaDayForDate(date: Date): TanaDay {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}` as TanaDay;
}

export function getTanaToday(): TanaDay {
  return getTanaDayForDate(new Date());
}

export function addTanaDays(day: TanaDay, amount: number): TanaDay {
  const date = toUtcDate(day);

  if (!date || !Number.isInteger(amount)) return day;

  date.setUTCDate(date.getUTCDate() + amount);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}` as TanaDay;
}

export function getTanaDayParts(day: TanaDay): TanaDayParts {
  const date = toUtcDate(day);

  if (!date) {
    throw new Error(`Invalid Tana day: ${day}`);
  }

  // ISO week: move to Thursday, then count full weeks since the first Thursday.
  const weekDate = new Date(date);
  const weekday = weekDate.getUTCDay() || 7;
  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    week,
    year: date.getUTCFullYear(),
  };
}

export function formatTanaDay(day: TanaDay): string {
  const { day: date, month, week, year } = getTanaDayParts(day);

  return `${year}年${month}月${date}日 · 第${week}周`;
}

export function getTanaTimeKey(time: TanaTime): string {
  return `${time.unit}:${time.value}`;
}

export function getTanaDayTime(day: TanaDay): TanaTime {
  return { unit: 'day', value: day };
}

export function getTanaDayNodeId(
  timeNodeIds: ReadonlyMap<string, NodeId>,
  day: TanaDay
): NodeId | undefined {
  return timeNodeIds.get(getTanaTimeKey(getTanaDayTime(day)));
}
