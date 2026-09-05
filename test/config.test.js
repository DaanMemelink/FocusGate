import { describe, it, eq, ok } from "./harness.js";
import CONFIG from "../config/defaults.json" with { type: "json" };
import { DEFAULT_SETTINGS, BUNDLED_CLIPS, parseQuotes } from "../src/core/defaults.js";
import { LEVELS } from "../src/core/levels.js";
import { matchRule, parsePattern } from "../src/core/rules.js";
import { existsSync } from "node:fs";

// config/defaults.json is hand-edited, so a typo there must fail here rather
// than at load time in the browser.
describe("config/defaults.json is well-formed", () => {
  it("every rule has the required fields", () => {
    for (const r of CONFIG.rules) {
      ok(typeof r.host === "string" && r.host.length, `host: ${JSON.stringify(r)}`);
      ok(typeof r.path === "string", `path: ${JSON.stringify(r)}`);
      ok(LEVELS.includes(r.level), `unknown level ${r.level}`);
      ok(r.wait === null || Number.isFinite(r.wait), `wait: ${JSON.stringify(r)}`);
      ok(r.unlock === null || Number.isFinite(r.unlock), `unlock: ${JSON.stringify(r)}`);
    }
  });

  it("hosts and paths are already normalized", () => {
    for (const r of CONFIG.rules) {
      const parsed = parsePattern(r.host + r.path);
      eq(parsed.host, r.host, "host");
      eq(parsed.path, r.path, "path");
    }
  });

  it("no two rules share a key", () => {
    const keys = CONFIG.rules.map((r) => r.host + r.path);
    eq(keys.length, new Set(keys).size, "duplicate rule");
  });

  it("presets cover every gated level and respect the 5-minute floor", () => {
    for (const level of ["Light", "Standard", "Maximum"]) {
      const p = CONFIG.presets[level];
      ok(p, `missing preset ${level}`);
      ok(Number.isFinite(p.wait) && p.wait >= 0, `${level}.wait`);
      ok(Number.isFinite(p.unlock) && p.unlock >= 5, `${level}.unlock must be >= 5`);
    }
  });

  it("at least one gate step ships enabled", () => {
    ok(["wait", "task", "intent", "commit"].some((k) => CONFIG.steps[k]));
  });

  it("days is seven booleans, Monday-first", () => {
    eq(CONFIG.days.length, 7);
    for (const d of CONFIG.days) eq(typeof d, "boolean");
  });

  it("clip frequency is a percentage", () => {
    ok(CONFIG.clipRate >= 0 && CONFIG.clipRate <= 100);
  });

  it("every bundled clip actually exists on disk", () => {
    for (const file of CONFIG.clipFiles) ok(existsSync(file), `missing clip: ${file}`);
  });
});

describe("the config becomes the default settings", () => {
  it("quotes are joined into the textarea's newline form", () => {
    eq(typeof DEFAULT_SETTINGS.quotes, "string");
    eq(parseQuotes(DEFAULT_SETTINGS.quotes).length, CONFIG.quotes.length);
  });

  it("attribution survives the round trip", () => {
    const withAuthor = parseQuotes(DEFAULT_SETTINGS.quotes).find((q) => q.author);
    ok(withAuthor, "expected at least one attributed quote");
    ok(withAuthor.text.length && !withAuthor.text.includes("—"), "separator was not stripped");
  });

  it("wiring keys never leak into saved settings", () => {
    eq(DEFAULT_SETTINGS.clipFiles, undefined);
    eq(DEFAULT_SETTINGS._comment, undefined);
    ok(Array.isArray(BUNDLED_CLIPS) && BUNDLED_CLIPS.length);
  });

  it("the shipped rules behave as intended", () => {
    const r = DEFAULT_SETTINGS.rules;
    eq(matchRule("https://music.youtube.com/", r).level, "Allowed");
    eq(matchRule("https://www.youtube.com/watch?v=x", r).level, "Light");
    eq(matchRule("https://www.youtube.com/shorts/x", r).level, "Standard");
    eq(matchRule("https://instagram.com/", r).level, "Standard");
  });
});
