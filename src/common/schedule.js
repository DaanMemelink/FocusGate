// Time-window logic.
//
// UTC offset handling: we never store or compare UTC directly. The schedule is
// expressed in wall-clock "HH:MM" and compared against `now.getHours()` /
// `now.getMinutes()`, which the browser reports in the machine's LOCAL time
// zone. So "07:00–20:00" automatically means 07:00–20:00 wherever the user is,
// and the user's UTC offset is baked into `new Date()` for free.
(function (root) {
  const Focus = (root.Focus = root.Focus || {});

  // "HH:MM" -> minutes since local midnight.
  Focus.parseTime = function (hhmm) {
    const [h, m] = String(hhmm).split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // Is `now` inside [start, end)? Handles windows that wrap past midnight,
  // e.g. start "22:00", end "06:00".
  Focus.isWithinSchedule = function (schedule, now) {
    now = now || new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const start = Focus.parseTime(schedule.start);
    const end = Focus.parseTime(schedule.end);

    if (start === end) return false; // zero-length window = never block
    if (start < end) return cur >= start && cur < end;
    return cur >= start || cur < end; // overnight window
  };
})(globalThis);
