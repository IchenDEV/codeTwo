export type AutomationCadence =
  | "hourly"
  | "daily"
  | "weekdays"
  | "weekly"
  | "custom";

export interface ScheduleDraft {
  cadence: AutomationCadence;
  time: string;
  weekday: number;
  customCron: string;
}

const DAILY = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;
const WEEKDAYS = /^(\d{1,2}) (\d{1,2}) \* \* 1-5$/;
const WEEKLY = /^(\d{1,2}) (\d{1,2}) \* \* ([0-6])$/;
const HOURLY = /^(\d{1,2}) \* \* \* \*$/;

function timeParts(time: string): [number, number] {
  const [hour, minute] = time.split(":").map(Number);
  return [
    Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9,
    Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0,
  ];
}

export function cronFromSchedule(schedule: ScheduleDraft): string {
  const [hour, minute] = timeParts(schedule.time);
  switch (schedule.cadence) {
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly":
      return `${minute} ${hour} * * ${Math.min(6, Math.max(0, schedule.weekday))}`;
    case "custom":
      return schedule.customCron.trim().replace(/\s+/g, " ");
  }
}

export function scheduleFromCron(cron: string): ScheduleDraft {
  const normalized = cron.trim().replace(/\s+/g, " ");
  let match = normalized.match(HOURLY);
  if (match) {
    return {
      cadence: "hourly",
      time: `09:${match[1].padStart(2, "0")}`,
      weekday: 1,
      customCron: normalized,
    };
  }
  match = normalized.match(WEEKDAYS);
  if (match) {
    return {
      cadence: "weekdays",
      time: `${match[2].padStart(2, "0")}:${match[1].padStart(2, "0")}`,
      weekday: 1,
      customCron: normalized,
    };
  }
  match = normalized.match(WEEKLY);
  if (match) {
    return {
      cadence: "weekly",
      time: `${match[2].padStart(2, "0")}:${match[1].padStart(2, "0")}`,
      weekday: Number(match[3]),
      customCron: normalized,
    };
  }
  match = normalized.match(DAILY);
  if (match) {
    return {
      cadence: "daily",
      time: `${match[2].padStart(2, "0")}:${match[1].padStart(2, "0")}`,
      weekday: 1,
      customCron: normalized,
    };
  }
  return {
    cadence: "custom",
    time: "09:00",
    weekday: 1,
    customCron: normalized,
  };
}

export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
