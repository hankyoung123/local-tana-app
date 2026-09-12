import type { NodeId, TanaTime } from "./types";

/** ISO calendar values are deliberately timezone-free canonical values. */
export type TanaDay = `${number}-${number}-${number}`;
export type TanaMonth = `${number}-${number}`;
export type TanaWeek = `${number}-W${number}`;
export type TanaDateGranularity = TanaTime["unit"];

export type TanaDateInterval = {
  end: Date;
  granularity: TanaDateGranularity;
  start: Date;
};

export type TanaDayParts = {
  day: number;
  /** ISO-8601 week number, with Monday as the first day of the week. */
  week: number;
  /** ISO week-year. It differs from the civil year near New Year. */
  weekYear: number;
  month: number;
  year: number;
};

function createUtcDate(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  // Date.UTC treats years 0–99 as 1900 + year. Setting the full year after
  // constructing from an epoch keeps the canonical parser correct for every
  // four-digit year it accepts.
  const result = new Date(0);
  result.setUTCHours(hour, minute, second, millisecond);
  result.setUTCFullYear(year, monthIndex, day);
  return result;
}

function toUtcDate(day: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return;
  const [, yearText, monthText, dateText] = match;
  const year = Number(yearText);
  if (year < 1 || year > 9999) return;
  const month = Number(monthText);
  const date = Number(dateText);
  const result = createUtcDate(year, month - 1, date);
  return result.getUTCFullYear() === year &&
    result.getUTCMonth() === month - 1 &&
    result.getUTCDate() === date
    ? result
    : undefined;
}

function toUtcMonth(month: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return;
  const year = Number(match[1]);
  const value = Number(match[2]);
  if (year < 1 || year > 9999 || value < 1 || value > 12) return;
  const result = createUtcDate(year, value - 1, 1);
  return result.getUTCFullYear() === year && result.getUTCMonth() === value - 1
    ? result
    : undefined;
}

function toUtcYear(year: string): Date | undefined {
  if (!/^\d{4}$/.test(year)) return;
  const value = Number(year);
  if (value < 1 || value > 9999) return;
  const result = createUtcDate(value, 0, 1);
  return result.getUTCFullYear() === value ? result : undefined;
}

function isoWeeksInYear(year: number): number {
  return getTanaDayParts(`${year}-12-28` as TanaDay).week;
}

function toUtcWeek(week: string): Date | undefined {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) return;
  const year = Number(match[1]);
  const number = Number(match[2]);
  if (year < 1 || year > 9999) return;
  if (number < 1 || number > isoWeeksInYear(year)) return;
  const jan4 = createUtcDate(year, 0, 4);
  const weekday = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() + 1 - weekday + (number - 1) * 7);
  return monday;
}

function toUtcDateTime(value: string): Date | undefined {
  // Date-only values are intentionally parsed by the day branch. Datetimes
  // require an explicit time and are normalized to a valid Date instant.
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? 0);
  const offsetHour = Number(match[5] ?? 0);
  const offsetMinute = Number(match[6] ?? 0);
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) return;
  // JavaScript normalizes invalid calendar dates (for example 2026-02-29)
  // instead of rejecting them. Validate the date portion before constructing
  // the instant so every date granularity shares the same strict parser.
  if (!toUtcDate(match[1])) return;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toTime(value: string): Date | undefined {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return;
  return new Date(Date.UTC(1970, 0, 1, hour, minute, second));
}

function endOfDay(day: Date): Date {
  const end = new Date(day);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function endOfMonth(start: Date): Date {
  return new Date(
    createUtcDate(
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  );
}

function endOfYear(start: Date): Date {
  return createUtcDate(start.getUTCFullYear(), 11, 31, 23, 59, 59, 999);
}

/** Rejects partial or rollover dates so every consumer receives one identity. */
export function isTanaDay(value: unknown): value is TanaDay {
  return typeof value === "string" && !!toUtcDate(value);
}

export function isTanaMonth(value: unknown): value is TanaMonth {
  return typeof value === "string" && !!toUtcMonth(value);
}

export function isTanaYear(value: unknown): value is `${number}` {
  return typeof value === "string" && !!toUtcYear(value);
}

export function isTanaWeek(value: unknown): value is TanaWeek {
  return typeof value === "string" && !!toUtcWeek(value);
}

export function isTanaDateTime(value: unknown): value is string {
  return typeof value === "string" && !!toUtcDateTime(value);
}

export function isTanaClockTime(value: unknown): value is string {
  return typeof value === "string" && !!toTime(value);
}

/** A range is inclusive and has an unambiguous `start/end` spelling. */
export function isTanaDateRange(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const [start, end, extra] = value.split("/");
  if (!start || !end || extra !== undefined) return false;
  const startInterval = parseTanaDateValue(start);
  const endInterval = parseTanaDateValue(end);
  return (
    !!startInterval && !!endInterval && startInterval.start <= endInterval.end
  );
}

export function parseTanaDateValue(
  value: unknown,
): TanaDateInterval | undefined {
  if (typeof value !== "string") return;
  const day = toUtcDate(value);
  if (day) return { start: day, end: endOfDay(day), granularity: "day" };
  const month = toUtcMonth(value);
  if (month)
    return { start: month, end: endOfMonth(month), granularity: "month" };
  const year = toUtcYear(value);
  if (year) return { start: year, end: endOfYear(year), granularity: "year" };
  const week = toUtcWeek(value);
  if (week)
    return {
      start: week,
      end: endOfDay(addUtcDays(week, 6)),
      granularity: "week",
    };
  const datetime = toUtcDateTime(value);
  if (datetime)
    return { start: datetime, end: datetime, granularity: "datetime" };
  const time = toTime(value);
  if (time) return { start: time, end: time, granularity: "time" };
  const [rangeStart, rangeEnd, extra] = value.split("/");
  if (!rangeStart || !rangeEnd || extra !== undefined) return;
  const start = parseTanaDateValue(rangeStart);
  const end = parseTanaDateValue(rangeEnd);
  if (!start || !end || start.start > end.end) return;
  return { start: start.start, end: end.end, granularity: "range" };
}

export function isTanaDateValue(value: unknown): value is string {
  return !!parseTanaDateValue(value);
}

/** Returns the canonical granularity for a date value without reimplementing
 * parser rules at call sites. */
export function getTanaDateGranularity(
  value: unknown,
): TanaDateGranularity | undefined {
  return typeof value === "string" ? parseTanaDateValue(value)?.granularity : undefined;
}

export function isTanaTime(value: unknown): value is TanaTime {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const time = value as { unit?: unknown; value?: unknown };
  if (typeof time.value !== "string" || typeof time.unit !== "string")
    return false;
  const interval = parseTanaDateValue(time.value);
  return !!interval && interval.granularity === time.unit;
}

function addUtcDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function isoFromDate(date: Date): TanaDay {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}` as TanaDay;
}

/** Formats a Date in an explicit workspace timezone, never the browser default. */
export function getTanaDayForDate(
  date: Date,
  workspaceTimeZone = "UTC",
): TanaDay {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: workspaceTimeZone,
    }).formatToParts(date);
  } catch {
    // Invalid persisted zones are rejected at validation. This deterministic
    // fallback makes pure callers fail safe rather than using machine time.
    return isoFromDate(date);
  }
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = read("year");
  const month = read("month");
  const day = read("day");
  return year && month && day
    ? (`${year}-${month}-${day}` as TanaDay)
    : isoFromDate(date);
}

export function getTanaToday(
  workspaceTimeZone = "UTC",
  now = new Date(),
): TanaDay {
  return getTanaDayForDate(now, workspaceTimeZone);
}

export function addTanaDays(day: TanaDay, amount: number): TanaDay {
  const date = toUtcDate(day);
  if (!date || !Number.isInteger(amount)) return day;
  return isoFromDate(addUtcDays(date, amount));
}

/** Calendar Week presentation is ISO-aligned: Monday through Sunday. */
export function getTanaWeekStart(day: TanaDay): TanaDay {
  const date = toUtcDate(day);
  if (!date) return day;
  return addTanaDays(day, 1 - (date.getUTCDay() || 7));
}

export function getTanaDayParts(day: TanaDay): TanaDayParts {
  const date = toUtcDate(day);
  if (!date) throw new Error(`Invalid Tana day: ${day}`);
  const weekDate = new Date(date);
  const weekday = weekDate.getUTCDay() || 7;
  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - weekday);
  const weekYear = weekDate.getUTCFullYear();
  const yearStart = createUtcDate(weekYear, 0, 1);
  const week = Math.ceil(
    ((weekDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    week,
    weekYear,
    year: date.getUTCFullYear(),
  };
}

export function getTanaMonthForDay(day: TanaDay): TanaMonth {
  return day.slice(0, 7) as TanaMonth;
}

export function getTanaWeekForDay(day: TanaDay): TanaWeek {
  const { week, weekYear } = getTanaDayParts(day);
  return `${String(weekYear).padStart(4, "0")}-W${String(week).padStart(2, "0")}` as TanaWeek;
}

export function getTanaYearForDay(day: TanaDay): `${number}` {
  return day.slice(0, 4) as `${number}`;
}

export function formatTanaDay(day: TanaDay): string {
  const { day: date, month, week, year } = getTanaDayParts(day);
  return `${year}年${month}月${date}日 · 第${week}周`;
}

export function formatTanaDateValue(value: string): string {
  const interval = parseTanaDateValue(value);
  if (!interval) return value;
  if (interval.granularity === "day") return formatTanaDay(value as TanaDay);
  if (interval.granularity === "month") return `${value} 月`;
  if (interval.granularity === "week") return `${value} 周`;
  if (interval.granularity === "year") return `${value} 年`;
  return value;
}

export function compareTanaDateValues(
  left: string,
  right: string,
): number | undefined {
  const lhs = parseTanaDateValue(left);
  const rhs = parseTanaDateValue(right);
  if (!lhs || !rhs) return;
  return lhs.start < rhs.start
    ? -1
    : lhs.start > rhs.start
      ? 1
      : lhs.end < rhs.end
        ? -1
        : lhs.end > rhs.end
          ? 1
          : 0;
}

export function tanaDateValuesOverlap(left: string, right: string): boolean {
  const lhs = parseTanaDateValue(left);
  const rhs = parseTanaDateValue(right);
  return !!lhs && !!rhs && lhs.start <= rhs.end && rhs.start <= lhs.end;
}

export function getTanaTimeKey(time: TanaTime): string {
  return `${time.unit}:${time.value}`;
}

export function getTanaDayTime(day: TanaDay): TanaTime {
  return { unit: "day", value: day };
}
export function getTanaWeekTime(week: TanaWeek): TanaTime {
  return { unit: "week", value: week };
}
export function getTanaYearTime(year: `${number}`): TanaTime {
  return { unit: "year", value: year };
}
export function getTanaMonthTime(month: TanaMonth): TanaTime {
  return { unit: "month", value: month };
}

/**
 * Returns the Calendar identities that a scalar date can describe. These are
 * values only; callers resolve them to existing Calendar NodeIds from the
 * derived index and never persist a Calendar link on the source.
 */
export function getTanaCalendarReferenceTimes(value: string): readonly TanaTime[] {
  const interval = parseTanaDateValue(value);
  if (!interval) return [];

  if (interval.granularity === "day") {
    const day = isoFromDate(interval.start);
    const parts = getTanaDayParts(day);
    return [
      getTanaDayTime(day),
      getTanaWeekTime(`${String(parts.weekYear).padStart(4, "0")}-W${String(parts.week).padStart(2, "0")}` as TanaWeek),
      getTanaMonthTime(getTanaMonthForDay(day)),
      getTanaYearTime(String(parts.weekYear).padStart(4, "0") as `${number}`),
    ];
  }

  if (interval.granularity === "week") {
    const start = isoFromDate(interval.start);
    const values: TanaTime[] = [
      getTanaWeekTime(getTanaWeekForDay(start)),
    ];
    const cursor = new Date(interval.start);
    while (cursor <= interval.end) {
      const day = isoFromDate(cursor);
      const parts = getTanaDayParts(day);
      values.push(getTanaMonthTime(getTanaMonthForDay(day)));
      values.push(getTanaYearTime(String(parts.weekYear).padStart(4, "0") as `${number}`));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return [...new Map(values.map((time) => [getTanaTimeKey(time), time])).values()];
  }

  if (interval.granularity === "month") {
    return [
      getTanaMonthTime(isoFromDate(interval.start).slice(0, 7) as TanaMonth),
      getTanaYearTime(String(interval.start.getUTCFullYear()).padStart(4, "0") as `${number}`),
    ];
  }

  if (interval.granularity === "year") {
    return [getTanaYearTime(String(interval.start.getUTCFullYear()) as `${number}`)];
  }

  // Datetimes and clock times do not have a unique Calendar hierarchy value;
  // map a datetime to its UTC day while leaving a clock-only value unresolved.
  if (interval.granularity === "datetime") {
    const day = isoFromDate(interval.start);
    const parts = getTanaDayParts(day);
    return [
      getTanaDayTime(day),
      getTanaWeekTime(getTanaWeekForDay(day)),
      getTanaMonthTime(getTanaMonthForDay(day)),
      getTanaYearTime(String(parts.weekYear).padStart(4, "0") as `${number}`),
    ];
  }

  return [];
}

export function getTanaTimeNodeId(
  timeNodeIds: ReadonlyMap<string, NodeId>,
  time: TanaTime,
): NodeId | undefined {
  return timeNodeIds.get(getTanaTimeKey(time));
}

export function getTanaDayNodeId(
  timeNodeIds: ReadonlyMap<string, NodeId>,
  day: TanaDay,
): NodeId | undefined {
  return getTanaTimeNodeId(timeNodeIds, getTanaDayTime(day));
}

/** Recognizes the intentionally small @ date grammar without guessing text. */
export function parseTanaDateObjectInput(
  input: string,
  today: TanaDay,
): string | undefined {
  const normalized = input.trim().toLowerCase();
  if (normalized === "today" || normalized === "今天") return today;
  const canonical = input.trim().replace(/\.\./g, "/");
  return isTanaDateValue(canonical) ? canonical : undefined;
}
