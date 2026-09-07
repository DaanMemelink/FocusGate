// Focus hours: is the gate awake right now?
//
// Times are wall-clock "HH:MM" compared against the browser's local time, so
// 09:00–18:00 means that wherever the machine is — `new Date()` already carries
// the UTC offset. Pure, so test/schedule.test.js can pin a date.

// `days` is Monday-first; Date#getDay() is Sunday-first.
export function dayIndex(date) {
  return (date.getDay() + 6) % 7;
}

export function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function parseClock(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return fallback;
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return h * 60 + m;
}

export function isWithinHours(settings, date = new Date()) {
  if (settings.always) return true;
  if (!(settings.days || [])[dayIndex(date)]) return false;

  const from = parseClock(settings.from, 0);
  const until = parseClock(settings.until, 24 * 60);
  const now = minutesOfDay(date);

  // A window that wraps past midnight (22:00–06:00) is two ranges, not one.
  if (from === until) return true;
  return from < until ? now >= from && now < until : now >= from || now < until;
}

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// When does the gate next wake up? Brute-forced a minute at a time over the
// coming week: ~11k cheap checks, and it stays obviously correct for windows
// that wrap past midnight and for arbitrary day patterns, which closed-form
// arithmetic would not. Returns null if it never wakes (no days enabled).
export function nextWake(settings, from = new Date()) {
  if (settings.always) return null;
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  for (let i = 0; i < 8 * 24 * 60; i++) {
    cursor.setMinutes(cursor.getMinutes() + 1);
    if (isWithinHours(settings, cursor)) return cursor;
  }
  return null;
}

// A plain-language answer to "is this thing on?". The gate being asleep is a
// perfectly normal state, but a silent one — without this, an extension outside
// its focus hours is indistinguishable from a broken extension.
export function describeSchedule(settings, now = new Date()) {
  if (settings.always) return { awake: true, detail: "Always on." };

  if (isWithinHours(settings, now)) {
    return { awake: true, detail: `Focus hours are ${settings.from}–${settings.until}.` };
  }

  const dayOff = !(settings.days || [])[dayIndex(now)];
  const wake = nextWake(settings, now);

  if (!wake) {
    return { awake: false, detail: "No focus days are selected, so nothing is ever gated." };
  }

  const sameDay = wake.toDateString() === now.toDateString();
  const when = sameDay
    ? `today at ${settings.from}`
    : `${DAY_NAMES[dayIndex(wake)]} at ${settings.from}`;

  return {
    awake: false,
    detail: dayOff
      ? `${DAY_NAMES[dayIndex(now)]} is not a focus day. Next awake ${when}.`
      : `Outside ${settings.from}–${settings.until}. Next awake ${when}.`,
  };
}

// Local calendar day, used to key the per-day counters. Deliberately local
// rather than UTC so "today" means the user's today.
export function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
