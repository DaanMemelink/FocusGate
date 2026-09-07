import { describe, it, eq, ok } from "./harness.js";
import { isWithinHours, dayIndex, dayKey, describeSchedule } from "../src/core/schedule.js";

// 2026-09-07 is a Monday.
const at = (iso) => new Date(iso);

const WEEKDAYS = { always: false, days: [true, true, true, true, true, false, false], from: "09:00", until: "18:00" };

describe("day indexing is Monday-first", () => {
  it("Monday is 0", () => eq(dayIndex(at("2026-09-07T12:00")), 0));
  it("Sunday is 6", () => eq(dayIndex(at("2026-09-13T12:00")), 6));
});

describe("focus hours", () => {
  it("inside the window on a weekday", () => eq(isWithinHours(WEEKDAYS, at("2026-09-07T10:00")), true));
  it("before the window", () => eq(isWithinHours(WEEKDAYS, at("2026-09-07T08:59")), false));
  it("at the start edge", () => eq(isWithinHours(WEEKDAYS, at("2026-09-07T09:00")), true));
  it("at the end edge is already out", () => eq(isWithinHours(WEEKDAYS, at("2026-09-07T18:00")), false));
  it("weekend is off", () => eq(isWithinHours(WEEKDAYS, at("2026-09-12T10:00")), false));
  it("always-on ignores days and hours", () =>
    eq(isWithinHours({ always: true, days: [false,false,false,false,false,false,false] }, at("2026-09-12T03:00")), true));
});

describe("a window that wraps past midnight", () => {
  const NIGHT = { always: false, days: [true,true,true,true,true,true,true], from: "22:00", until: "06:00" };
  it("late evening is inside", () => eq(isWithinHours(NIGHT, at("2026-09-07T23:30")), true));
  it("early morning is inside", () => eq(isWithinHours(NIGHT, at("2026-09-07T02:00")), true));
  it("midday is outside", () => eq(isWithinHours(NIGHT, at("2026-09-07T13:00")), false));
});

describe("day keys are local, not UTC", () => {
  it("formats as YYYY-MM-DD", () => eq(dayKey(at("2026-09-05T23:30")), "2026-09-05"));
});

describe("describing the schedule in plain language", () => {
  const WEEK = { always: false, days: [true,true,true,true,true,false,false], from: "09:00", until: "18:00" };
  it("awake inside hours", () => {
    const d = describeSchedule(WEEK, at("2026-09-07T10:00"));
    eq(d.awake, true);
  });
  it("explains a non-focus day and when it wakes", () => {
    const d = describeSchedule(WEEK, at("2026-09-05T20:59"));
    eq(d.awake, false);
    eq(d.detail, "Saturday is not a focus day. Next awake Monday at 09:00.");
  });
  it("explains being outside the hours on a focus day", () => {
    const d = describeSchedule(WEEK, at("2026-09-07T08:00"));
    eq(d.detail, "Outside 09:00–18:00. Next awake today at 09:00.");
  });
  it("always-on says so", () => eq(describeSchedule({ always: true }).detail, "Always on."));
  it("no days selected is called out as never gating", () => {
    const none = { always: false, days: [false,false,false,false,false,false,false], from: "09:00", until: "18:00" };
    const d = describeSchedule(none, at("2026-09-07T10:00"));
    eq(d.awake, false);
    eq(d.detail, "No focus days are selected, so nothing is ever gated.");
  });
});
