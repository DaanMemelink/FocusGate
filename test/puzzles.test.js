import { describe, it, eq, ok } from "./harness.js";
import { makePuzzle, isCorrect, normalizeAnswer, PUZZLE_KINDS } from "../src/core/puzzles.js";

// Deterministic RNG so generated puzzles can be asserted on.
const seeded = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("every kind generates a solvable puzzle", () => {
  for (const kind of PUZZLE_KINDS) {
    it(`${kind} answers its own prompt`, () => {
      const p = makePuzzle({ kind, host: "youtube.com" });
      ok(p.prompt.length > 0, "has a prompt");
      ok(p.answer.length > 0, "has an answer");
      ok(isCorrect(p, p.answer), "its own answer is accepted");
    });
  }
});

describe("math", () => {
  it("stays inside the designed ranges", () => {
    for (let i = 0; i < 300; i++) {
      const p = makePuzzle({ kind: "math" });
      const [, a, b, c] = /^(\d+) × (\d+) − (\d+)$/.exec(p.prompt);
      ok(+a >= 13 && +a <= 48, `a=${a}`);
      ok(+b >= 3 && +b <= 9, `b=${b}`);
      ok(+c >= 5 && +c <= 39, `c=${c}`);
      eq(p.answer, String(+a * +b - +c));
    }
  });
  it("computes a known case", () => {
    // rng always 0 -> a=13, b=3, c=5
    const p = makePuzzle({ kind: "math", rng: seeded([0]) });
    eq(p.prompt, "13 × 3 − 5");
    eq(p.answer, "34");
  });
});

describe("reverse", () => {
  it("is six characters, reversed", () => {
    const p = makePuzzle({ kind: "reverse" });
    eq(p.prompt.length, 6);
    eq(p.answer, p.prompt.split("").reverse().join(""));
  });
  it("avoids lookalike glyphs", () => {
    for (let i = 0; i < 200; i++) {
      const p = makePuzzle({ kind: "reverse" });
      ok(!/[IO01S5BGD2Z]/.test(p.prompt), `ambiguous glyph in ${p.prompt}`);
    }
  });
});

describe("pledge", () => {
  it("bakes in the host and the clock", () => {
    const p = makePuzzle({ kind: "pledge", host: "youtube.com", now: new Date("2026-09-05T14:32") });
    eq(p.prompt, "At 14:32 I chose youtube.com over my own work.");
    eq(p.answer, p.prompt);
  });
});

describe("answer comparison", () => {
  const p = { answer: "Hello  World" };
  it("trims", () => ok(isCorrect(p, "  Hello World  ")));
  it("collapses whitespace", () => ok(isCorrect(p, "Hello   World")));
  it("ignores case", () => ok(isCorrect(p, "hello world")));
  it("still rejects a wrong answer", () => ok(!isCorrect(p, "hello worlds")));
  it("normalizes null safely", () => eq(normalizeAnswer(null), ""));
});
