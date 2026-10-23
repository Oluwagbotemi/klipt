import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addDays,
  buildPublishingActivity,
  DEFAULT_OVERVIEW_PERIOD,
  parseOverviewPeriod,
} from "@/lib/overview";
import { axisTicks, formatNumber, numberParts, periodChange, smoothPath } from "@/lib/visual";

describe("number formatting", () => {
  test("splits whole, fraction and unit so decimals can be muted", () => {
    assert.deepEqual(numberParts(3430.75, { decimals: 2, prefix: "$" }), {
      prefix: "$",
      whole: "3,430",
      fraction: ".75",
      unit: "",
    });
    assert.deepEqual(numberParts(16), { prefix: "", whole: "16", fraction: "", unit: "" });
  });

  test("compacts big standalone values", () => {
    assert.equal(formatNumber(9_999), "9,999");
    assert.equal(formatNumber(12_900), "12.9K");
    assert.equal(formatNumber(4_200_000), "4.2M");
    assert.equal(formatNumber(1_500, { compact: false }), "1,500");
  });

  test("period change", () => {
    assert.equal(periodChange(0, 0), null);
    assert.deepEqual(periodChange(6, 4), { difference: 2, percent: 50 });
    assert.deepEqual(periodChange(3, 0), { difference: 3, percent: null });
  });

  test("axis ticks are round and cover the maximum", () => {
    assert.deepEqual(axisTicks(2, 3), [0, 1, 2]);
    assert.deepEqual(axisTicks(7, 3), [0, 5, 10]);
    assert.deepEqual(axisTicks(1240, 3), [0, 500, 1000, 1500]);
    assert.deepEqual(axisTicks(0), [0]);
  });

  test("smooth paths start at the first point and end at the last", () => {
    const d = smoothPath([
      { x: 0, y: 10 },
      { x: 50, y: 0 },
      { x: 100, y: 5 },
    ]);
    assert.match(d, /^M0,10 C/);
    assert.match(d, /100,5$/);
    assert.equal(smoothPath([]), "");
  });
});

describe("overview period and publishing buckets", () => {
  test("period comes from the URL with a safe default", () => {
    assert.equal(parseOverviewPeriod("7d"), 7);
    assert.equal(parseOverviewPeriod(["90d"]), 90);
    assert.equal(parseOverviewPeriod("365d"), DEFAULT_OVERVIEW_PERIOD);
    assert.equal(parseOverviewPeriod(undefined), DEFAULT_OVERVIEW_PERIOD);
  });

  test("days, the current day and days ahead", () => {
    const today = "2026-10-21";
    const activity = buildPublishingActivity({
      period: 7,
      today,
      publishedDays: ["2026-10-21", "2026-10-21", "2026-10-15", "2026-10-14", "2026-10-10"],
      scheduledDays: ["2026-10-23", "2026-10-30"],
    });
    assert.equal(activity.unit, "day");
    assert.deepEqual(
      activity.buckets.map((b) => [b.from, b.kind, b.published, b.scheduled]),
      [
        ["2026-10-15", "past", 1, 0],
        ["2026-10-16", "past", 0, 0],
        ["2026-10-17", "past", 0, 0],
        ["2026-10-18", "past", 0, 0],
        ["2026-10-19", "past", 0, 0],
        ["2026-10-20", "past", 0, 0],
        ["2026-10-21", "current", 2, 0],
        ["2026-10-22", "future", 0, 0],
        ["2026-10-23", "future", 0, 1],
        ["2026-10-24", "future", 0, 0],
      ],
    );
    // 15–21 Oct this period; 8–14 Oct the one before.
    assert.equal(activity.thisPeriod, 3);
    assert.equal(activity.previousPeriod, 2);
    assert.deepEqual(
      activity.daily.map((d) => d.count),
      [1, 0, 0, 0, 0, 0, 2],
    );
  });

  test("90 days uses 7-day windows ending today", () => {
    const today = "2026-10-21";
    const activity = buildPublishingActivity({
      period: 90,
      today,
      publishedDays: ["2026-10-15", "2026-10-14"],
      scheduledDays: ["2026-10-28"],
    });
    assert.equal(activity.unit, "week");
    assert.equal(activity.buckets.length, 13 + 2);
    const current = activity.buckets.find((b) => b.kind === "current")!;
    assert.deepEqual([current.from, current.to, current.published], ["2026-10-15", today, 1]);
    const next = activity.buckets.find((b) => b.kind === "future")!;
    assert.deepEqual([next.from, next.to, next.scheduled], ["2026-10-22", "2026-10-28", 1]);
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });
});
