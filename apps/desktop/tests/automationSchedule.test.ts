import { describe, expect, test } from "bun:test";

import { cronFromSchedule, scheduleFromCron } from "../src/automation/schedule";

describe("automation schedules", () => {
  test("builds the supported local-time cron presets", () => {
    expect(
      cronFromSchedule({ cadence: "hourly", time: "09:15", weekday: 1, customCron: "" }),
    ).toBe("15 * * * *");
    expect(
      cronFromSchedule({ cadence: "daily", time: "09:30", weekday: 1, customCron: "" }),
    ).toBe("30 9 * * *");
    expect(
      cronFromSchedule({ cadence: "weekdays", time: "18:05", weekday: 1, customCron: "" }),
    ).toBe("5 18 * * 1-5");
    expect(
      cronFromSchedule({ cadence: "weekly", time: "08:00", weekday: 5, customCron: "" }),
    ).toBe("0 8 * * 5");
  });

  test("round-trips presets and preserves a custom expression", () => {
    expect(scheduleFromCron("30 9 * * 1-5")).toMatchObject({
      cadence: "weekdays",
      time: "09:30",
    });
    expect(scheduleFromCron("*/20 8-18 * * 1-5")).toEqual({
      cadence: "custom",
      time: "09:00",
      weekday: 1,
      customCron: "*/20 8-18 * * 1-5",
    });
  });
});
