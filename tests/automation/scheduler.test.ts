import { describe, expect, it } from "vitest";
import { parseCronExpression, matchesCronFields } from "@/lib/automation/scheduler/cron-engine";
import { getWallClockFields, isValidTimezone } from "@/lib/automation/scheduler/timezone";
import { matchesSchedule, getNextScheduledRun, type ScheduleDefinition } from "@/lib/automation/scheduler/schedule-engine";

describe("Cron Engine (ranges, aliases)", () => {
  it("supporte les plages (a-b) dans un champ", () => {
    const parsed = parseCronExpression("0 9 * * 1-5");
    expect(matchesCronFields(parsed, { minute: 0, hour: 9, dayOfMonth: 15, month: 6, dayOfWeek: 3 })).toBe(true); // mercredi
    expect(matchesCronFields(parsed, { minute: 0, hour: 9, dayOfMonth: 15, month: 6, dayOfWeek: 0 })).toBe(false); // dimanche
  });

  it("supporte les alias courants", () => {
    expect(parseCronExpression("@daily")).toEqual(parseCronExpression("0 0 * * *"));
    expect(parseCronExpression("@hourly")).toEqual(parseCronExpression("0 * * * *"));
    expect(parseCronExpression("@weekly")).toEqual(parseCronExpression("0 0 * * 0"));
  });

  it("rejette une plage invalide", () => {
    expect(() => parseCronExpression("0 9 * * 5-1")).toThrow(/Plage cron invalide/);
  });
});

describe("Timezone (Intl, sans dépendance)", () => {
  it("calcule des champs muraux corrects pour un fuseau IANA", () => {
    // 2026-01-15T09:00:00Z = 10:00 à Paris en hiver (CET = UTC+1).
    const fields = getWallClockFields(new Date("2026-01-15T09:00:00Z"), "Europe/Paris");
    expect(fields.hour).toBe(10);
    expect(fields.minute).toBe(0);
  });

  it("valide un identifiant IANA, rejette un identifiant invalide", () => {
    expect(isValidTimezone("Europe/Paris")).toBe(true);
    expect(isValidTimezone("Not/A_Timezone")).toBe(false);
  });
});

describe("Enterprise Scheduler — fuseau horaire et heure d'été (DST)", () => {
  const schedule: ScheduleDefinition = { cronExpression: "0 10 * * *", timezone: "Europe/Paris" };

  it("hiver (CET = UTC+1) : 10h locales = 09h UTC", () => {
    expect(matchesSchedule(schedule, new Date("2026-01-15T09:00:00Z"))).toBe(true);
    expect(matchesSchedule(schedule, new Date("2026-01-15T10:00:00Z"))).toBe(false);
  });

  it("été (CEST = UTC+2) : 10h locales = 08h UTC — même expression cron, heure UTC différente", () => {
    expect(matchesSchedule(schedule, new Date("2026-07-15T08:00:00Z"))).toBe(true);
    expect(matchesSchedule(schedule, new Date("2026-07-15T09:00:00Z"))).toBe(false);
    expect(matchesSchedule(schedule, new Date("2026-07-15T10:00:00Z"))).toBe(false);
  });
});

describe("Enterprise Scheduler — jours ouvrés, jours fériés, blackout, fenêtres d'exécution", () => {
  it("businessDaysOnly exclut les week-ends", () => {
    const schedule: ScheduleDefinition = { cronExpression: "0 9 * * *", timezone: "UTC", businessDaysOnly: true };
    expect(matchesSchedule(schedule, new Date("2026-08-03T09:00:00Z"))).toBe(true); // lundi
    expect(matchesSchedule(schedule, new Date("2026-08-01T09:00:00Z"))).toBe(false); // samedi
    expect(matchesSchedule(schedule, new Date("2026-08-02T09:00:00Z"))).toBe(false); // dimanche
  });

  it("holidays exclut une date précise même un jour ouvré", () => {
    const schedule: ScheduleDefinition = { cronExpression: "0 9 * * *", timezone: "UTC", holidays: ["2026-08-03"] };
    expect(matchesSchedule(schedule, new Date("2026-08-03T09:00:00Z"))).toBe(false);
    expect(matchesSchedule(schedule, new Date("2026-08-04T09:00:00Z"))).toBe(true);
  });

  it("blackoutPeriods interdit toute exécution dans la fenêtre absolue", () => {
    const schedule: ScheduleDefinition = {
      cronExpression: "0 * * * *",
      blackoutPeriods: [{ start: new Date("2026-12-24T00:00:00Z"), end: new Date("2026-12-26T00:00:00Z") }],
    };
    expect(matchesSchedule(schedule, new Date("2026-12-25T10:00:00Z"))).toBe(false);
    expect(matchesSchedule(schedule, new Date("2026-12-23T10:00:00Z"))).toBe(true);
    expect(matchesSchedule(schedule, new Date("2026-12-26T10:00:00Z"))).toBe(true);
  });

  it("executionWindows n'autorise que les fenêtres quotidiennes déclarées, y compris une fenêtre traversant minuit", () => {
    const schedule: ScheduleDefinition = {
      cronExpression: "0 * * * *",
      timezone: "UTC",
      executionWindows: [{ startTime: "22:00", endTime: "02:00" }],
    };
    expect(matchesSchedule(schedule, new Date("2026-06-01T23:00:00Z"))).toBe(true);
    expect(matchesSchedule(schedule, new Date("2026-06-02T01:00:00Z"))).toBe(true);
    expect(matchesSchedule(schedule, new Date("2026-06-02T12:00:00Z"))).toBe(false);
  });
});

describe("getNextScheduledRun", () => {
  it("trouve la prochaine occurrence future correcte", () => {
    const schedule: ScheduleDefinition = { cronExpression: "0 9 * * *", timezone: "UTC" };
    const next = getNextScheduledRun(schedule, new Date("2026-08-03T10:00:00Z"));
    expect(next?.toISOString()).toBe("2026-08-04T09:00:00.000Z");
  });

  it("saute les jours fériés/week-ends si businessDaysOnly", () => {
    const schedule: ScheduleDefinition = { cronExpression: "0 9 * * *", timezone: "UTC", businessDaysOnly: true };
    // Vendredi 2026-07-31, la prochaine occurrence ouvrée est le lundi 2026-08-03.
    const next = getNextScheduledRun(schedule, new Date("2026-07-31T09:30:00Z"));
    expect(next?.toISOString()).toBe("2026-08-03T09:00:00.000Z");
  });
});
