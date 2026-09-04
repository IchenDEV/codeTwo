export type AutomationCadence =
  "hourly" | "daily" | "weekdays" | "weekly" | "custom";

export interface ScheduleDraft {
  cadence: AutomationCadence;
  time: string;
  weekday: number;
  customCron: string;
}

const DAILY = /^(\d{1,2}) (\d{1,2}) \* \* \*$/u;
const WEEKDAYS = /^(\d{1,2}) (\d{1,2}) \* \* 1-5$/u;
const WEEKLY = /^(\d{1,2}) (\d{1,2}) \* \* ([0-6])$/u;
const HOURLY = /^(\d{1,2}) \* \* \* \*$/u;

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
    case "hourly": {
      return `${minute} * * * *`;
    }
    case "daily": {
      return `${minute} ${hour} * * *`;
    }
    case "weekdays": {
      return `${minute} ${hour} * * 1-5`;
    }
    case "weekly": {
      return `${minute} ${hour} * * ${Math.min(6, Math.max(0, schedule.weekday))}`;
    }
    case "custom": {
      return schedule.customCron.trim().replaceAll(/\s+/gu, " ");
    }
  }
}

export function scheduleFromCron(cron: string): ScheduleDraft {
  const normalized = cron.trim().replaceAll(/\s+/gu, " ");
  let match = HOURLY.exec(normalized);
  if (match) {
    return {
      cadence: "hourly",
      customCron: normalized,
      time: `09:${match[1].padStart(2, "0")}`,
      weekday: 1,
    };
  }
  match = WEEKDAYS.exec(normalized);
  if (match) {
    return {
      cadence: "weekdays",
      customCron: normalized,
      time: `${match[2].padStart(2, "0")}:${match[1].padStart(2, "0")}`,
      weekday: 1,
    };
  }
  match = WEEKLY.exec(normalized);
  if (match) {
    return {
      cadence: "weekly",
      customCron: normalized,
      time: `${match[2].padStart(2, "0")}:${match[1].padStart(2, "0")}`,
      weekday: Number(match[3]),
    };
  }
  match = DAILY.exec(normalized);
  if (match) {
    return {
      cadence: "daily",
      customCron: normalized,
      time: `${match[2].padStart(2, "0")}:${match[1].padStart(2, "0")}`,
      weekday: 1,
    };
  }
  return {
    cadence: "custom",
    customCron: normalized,
    time: "09:00",
    weekday: 1,
  };
}

export function localTimezone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
