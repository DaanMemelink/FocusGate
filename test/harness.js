// Assertions and the result tally. Separate from run.js so the test files can
// import it without forming a cycle with the runner that imports them.

export const results = { passed: 0, failures: [] };
let current = "";

export function describe(name, fn) {
  current = name;
  fn();
}

export function it(name, fn) {
  const label = `${current} › ${name}`;
  try {
    fn();
    results.passed++;
  } catch (err) {
    results.failures.push({ label, message: err && err.message ? err.message : String(err) });
  }
}

export function eq(actual, expected, note = "") {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${note ? note + ": " : ""}expected ${b}, got ${a}`);
}

export function ok(value, note = "expected truthy") {
  if (!value) throw new Error(note);
}
