import { describe, it, eq, ok } from "./harness.js";
import {
  matchRule,
  ruleKey,
  shouldGate,
  specificity,
  parsePattern,
  pathMatches,
  matchOrderBadges,
} from "../src/core/rules.js";

// The trio the handoff calls out by name, plus the rules that ship alongside.
const RULES = [
  { host: "music.youtube.com", path: "", level: "Allowed" },
  { host: "youtube.com", path: "", level: "Light" },
  { host: "youtube.com", path: "/shorts", level: "Standard" },
  { host: "instagram.com", path: "", level: "Standard" },
];

const levelFor = (url) => {
  const r = matchRule(url, RULES);
  return r ? r.level : null;
};

describe("the YouTube trio", () => {
  it("youtube.com is Light", () => eq(levelFor("https://www.youtube.com/"), "Light"));
  it("a watch page is Light", () => eq(levelFor("https://www.youtube.com/watch?v=abc"), "Light"));
  it("/shorts beats the bare domain", () =>
    eq(levelFor("https://www.youtube.com/shorts/GwufM_5DoV8"), "Standard"));
  it("/shorts applies on m.youtube.com too", () =>
    eq(levelFor("https://m.youtube.com/shorts/abc"), "Standard"));
  it("music.youtube.com beats youtube.com", () =>
    eq(levelFor("https://music.youtube.com/"), "Allowed"));
  it("an exact subdomain outranks a path rule on the parent", () =>
    eq(levelFor("https://music.youtube.com/shorts/abc"), "Allowed"));
});

describe("path matching is segment-aware", () => {
  it("/shortstories is not under /shorts", () =>
    eq(levelFor("https://www.youtube.com/shortstories"), "Light"));
  it("a query mentioning shorts is not under /shorts", () =>
    eq(levelFor("https://www.youtube.com/results?q=shorts"), "Light"));
  it("/shorts itself matches", () => eq(pathMatches("/shorts", "/shorts"), true));
  it("/shorts/ matches", () => eq(pathMatches("/shorts/", "/shorts"), true));
  it("/shorts/abc matches", () => eq(pathMatches("/shorts/abc", "/shorts"), true));
  it("/shortsxyz does not", () => eq(pathMatches("/shortsxyz", "/shorts"), false));
  it("a rule with no path matches everything", () => eq(pathMatches("/anything", ""), true));
});

describe("gating verdicts", () => {
  it("Allowed short-circuits", () => eq(shouldGate("https://music.youtube.com/", RULES), false));
  it("a blocking rule gates", () => eq(shouldGate("https://instagram.com/", RULES), true));
  it("an unmatched host is out of scope", () => eq(shouldGate("https://github.com/", RULES), false));
  it("non-http schemes never match", () =>
    eq(matchRule("chrome-extension://abc/gate.html", RULES), null));
  it("a malformed URL never matches", () => eq(matchRule("not a url", RULES), null));
});

describe("list order is irrelevant", () => {
  it("reversing the rules changes no verdict", () => {
    const reversed = RULES.slice().reverse();
    for (const url of [
      "https://www.youtube.com/watch",
      "https://www.youtube.com/shorts/a",
      "https://music.youtube.com/",
      "https://instagram.com/",
    ]) {
      eq(ruleKey(matchRule(url, reversed)), ruleKey(matchRule(url, RULES)), url);
    }
  });
});

describe("rule keys", () => {
  // This is what keeps a Light pass on /watch from unlocking /shorts.
  it("the bare domain and its path rule are different keys", () => {
    const watch = ruleKey(matchRule("https://www.youtube.com/watch", RULES));
    const shorts = ruleKey(matchRule("https://www.youtube.com/shorts/a", RULES));
    eq(watch, "youtube.com");
    eq(shorts, "youtube.com/shorts");
    ok(watch !== shorts, "keys must differ");
  });
});

describe("specificity ordering", () => {
  it("host labels outrank path length", () => {
    ok(
      specificity({ host: "music.youtube.com", path: "" }) >
        specificity({ host: "youtube.com", path: "/shorts" }),
      "an exact subdomain must win"
    );
  });
  it("a longer path wins within one host", () => {
    ok(
      specificity({ host: "youtube.com", path: "/shorts" }) >
        specificity({ host: "youtube.com", path: "" })
    );
  });
});

describe("pattern parsing", () => {
  const cases = [
    ["youtube.com/shorts", { host: "youtube.com", path: "/shorts" }],
    ["https://www.YouTube.com/Shorts/", { host: "youtube.com", path: "/shorts" }],
    ["  youtube.com/shorts?x=1  ", { host: "youtube.com", path: "/shorts" }],
    ["youtube.com/", { host: "youtube.com", path: "" }],
    ["youtube.com", { host: "youtube.com", path: "" }],
    ["http://example.com:8080/a/b", { host: "example.com", path: "/a/b" }],
  ];
  for (const [input, expected] of cases) {
    it(`parses ${JSON.stringify(input)}`, () => eq(parsePattern(input), expected));
  }
});

describe("match-order badges", () => {
  it("numbers siblings by specificity and dots the loners", () => {
    const badges = matchOrderBadges(RULES);
    // Three youtube.com rules compete; instagram has no sibling.
    eq(badges[0], "01", "music.youtube.com is checked first");
    eq(badges[2], "02", "youtube.com/shorts is second");
    eq(badges[1], "03", "bare youtube.com is last");
    eq(badges[3], "·", "instagram competes with nothing");
  });
});
