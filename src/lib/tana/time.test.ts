import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareTanaDateValues,
  getTanaDayForDate,
  getTanaDayParts,
  getTanaWeekForDay,
  getTanaWeekStart,
  getTanaToday,
  getTanaDateGranularity,
  isTanaDateValue,
  isTanaTime,
  parseTanaDateObjectInput,
  tanaDateValuesOverlap,
} from "./time";

test("Today uses workspace timezone across midnight", () => {
  const instant = new Date("2026-01-01T23:30:00.000Z");
  assert.equal(getTanaToday("Pacific/Auckland", instant), "2026-01-02");
  assert.equal(getTanaDayForDate(instant, "America/Los_Angeles"), "2026-01-01");
});

test("date core handles leap years, ISO week boundaries and ranges", () => {
  assert.equal(isTanaDateValue("2024-02-29"), true);
  assert.equal(isTanaDateValue("2023-02-29"), false);
  assert.equal(getTanaWeekForDay("2021-01-01"), "2020-W53");
  assert.equal(getTanaWeekStart("2021-01-01"), "2020-12-28");
  assert.equal(getTanaDayParts("2020-12-31").weekYear, 2020);
  assert.equal(isTanaDateValue("2026-01-01/2026-01-03"), true);
  assert.equal(
    tanaDateValuesOverlap("2026-01-01/2026-01-03", "2026-01-02"),
    true,
  );
  assert.equal(compareTanaDateValues("2026-01", "2026-02"), -1);
  assert.equal(isTanaDateValue("2026-02-29T12:00:00Z"), false);
  assert.equal(isTanaDateValue("0000-01-01"), false);
});

test("date parser preserves every supported granularity without rollover", () => {
  assert.equal(getTanaDateGranularity("2026"), "year");
  assert.equal(getTanaDateGranularity("2026-02"), "month");
  assert.equal(getTanaDateGranularity("2026-W09"), "week");
  assert.equal(getTanaDateGranularity("2026-02-28"), "day");
  assert.equal(getTanaDateGranularity("2026-02-28T23:59:00Z"), "datetime");
  assert.equal(getTanaDateGranularity("23:59"), "time");
  assert.equal(getTanaDateGranularity("2026-02-28/2026-03-01"), "range");
  assert.equal(isTanaDateValue("2026-W54"), false);
  assert.equal(isTanaDateValue("2026-02-30T12:00:00Z"), false);
  assert.equal(isTanaTime({ unit: 'day', value: '2026-02-28' }), true);
  assert.equal(isTanaTime({ unit: 'datetime', value: '2026-02-28T12:00:00Z' }), false);
  assert.equal(parseTanaDateObjectInput('tomorrow', '2026-02-28'), '2026-03-01');
  assert.equal(parseTanaDateObjectInput('昨天', '2026-03-01'), '2026-02-28');
});
