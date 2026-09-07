// Step 2 puzzles.
//
// The point is cost, not security — by the time you've done two-digit
// arithmetic the reflex that opened the tab has usually passed. A wrong answer
// never re-offers the same puzzle: `makePuzzle` is called again, so guessing
// buys nothing. Pure, so test/puzzles.test.js can seed the RNG.

// No I/O/0/1/S/5 lookalikes — misreading a glyph feels like a broken puzzle
// rather than a deterrent, and that gets the extension uninstalled.
const CODE_ALPHABET = "ACEFHJKLMNPRTUVWXY349";

export const PUZZLE_KINDS = ["math", "reverse", "pledge"];

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function clock(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function makePuzzle({ host = "this site", rng = Math.random, now = new Date(), kind } = {}) {
  const pick = kind || PUZZLE_KINDS[randInt(rng, 0, PUZZLE_KINDS.length - 1)];

  if (pick === "math") {
    // Two-digit x one-digit with a term taken off: too much to eyeball, small
    // enough to finish in your head. Anything harder just sends people to open
    // a calculator in another tab, which is worse than the thing we're gating.
    const a = randInt(rng, 13, 48);
    const b = randInt(rng, 3, 9);
    const c = randInt(rng, 5, 39);
    return {
      kind: "math",
      label: "Step two — mental arithmetic, no calculator",
      prompt: `${a} × ${b} − ${c}`,
      answer: String(a * b - c),
    };
  }

  if (pick === "reverse") {
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randInt(rng, 0, CODE_ALPHABET.length - 1)];
    return {
      kind: "reverse",
      label: "Step two — type this code backwards",
      prompt: code,
      answer: code.split("").reverse().join(""),
    };
  }

  // The clock time is baked in so the sentence is never the same twice — no
  // muscle memory, no autofill, and reading your own excuse back is the point.
  const line = `At ${clock(now)} I chose ${host} over my own work.`;
  return { kind: "pledge", label: "Step two — retype this, exactly", prompt: line, answer: line };
}

// Trim, collapse runs of whitespace, lowercase. Being stricter than this is
// frustrating in a way that reads as a bug rather than as a deterrent.
export function normalizeAnswer(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").toLowerCase();
}

export function isCorrect(puzzle, typed) {
  return Boolean(puzzle) && normalizeAnswer(typed) === normalizeAnswer(puzzle.answer);
}
