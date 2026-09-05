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

// Local calendar day, used to key the per-day counters. Deliberately local
// rather than UTC so "today" means the user's today.
export function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
