import { describe, it, eq, ok } from "./harness.js";
import {
  waitSeconds,
  passMinutes,
  isVideoHost,
  MIN_PASS_MINUTES,
  MAX_WAIT_SECONDS,
} from "../src/core/levels.js";

const CFG = {
  presets: {
    Light: { wait: 5, unlock: 30 },
    Standard: { wait: 30, unlock: 15 },
    Maximum: { wait: 60, unlock: 5 },
  },
};

const rule = (level, extra = {}) =>
  Object.assign({ host: "instagram.com", path: "", level, wait: null, unlock: null }, extra);

describe("wait comes from the level preset", () => {
  it("Light", () => eq(waitSeconds(rule("Light"), CFG, 0), 5));
  it("Standard", () => eq(waitSeconds(rule("Standard"), CFG, 0), 30));
  it("Maximum", () => eq(waitSeconds(rule("Maximum"), CFG, 0), 60));
  it("a per-rule override beats the preset", () =>
    eq(waitSeconds(rule("Standard", { wait: 12 }), CFG, 0), 12));
  it("an override of 0 is honoured, not treated as absent", () =>
    eq(waitSeconds(rule("Standard", { wait: 0 }), CFG, 0), 0));
});

describe("each cave doubles the next wait", () => {
  it("30s escalates 30/60/120/240", () => {
    eq([0, 1, 2, 3].map((n) => waitSeconds(rule("Standard"), CFG, n)), [30, 60, 120, 240]);
  });
  it("capped so it never becomes absurd", () =>
    eq(waitSeconds(rule("Standard"), CFG, 10), MAX_WAIT_SECONDS));
});

describe("pass length", () => {
  it("Standard is the preset", () => eq(passMinutes(rule("Standard"), CFG, 0), 15));
  it("Light is the long one", () => eq(passMinutes(rule("Light"), CFG, 0), 30));
  it("Maximum is the short one", () => eq(passMinutes(rule("Maximum"), CFG, 0), 5));
  it("each cave takes two minutes off", () =>
    eq([0, 1, 2].map((n) => passMinutes(rule("Standard"), CFG, n)), [15, 13, 11]));
  it("never drops below the five-minute floor", () => {
    for (const caves of [0, 3, 9, 99]) {
      ok(passMinutes(rule("Maximum"), CFG, caves) >= MIN_PASS_MINUTES, `caves=${caves}`);
    }
    eq(passMinutes(rule("Maximum"), CFG, 99), MIN_PASS_MINUTES);
  });

  // The floor exists so a pass cannot already be over when it is granted:
  // clearing the gate redirects to the site, the worker inspects that
  // navigation, and an expired pass would gate the tab again on arrival.
  it("never grants a pass of zero, which would re-gate on arrival", () => {
    for (const unlock of [0, -5, null, undefined, NaN]) {
      ok(
        passMinutes(rule("Standard", { unlock }), CFG, 99) >= 1,
        `unlock=${unlock} produced a pass that is already over`
      );
    }
  });

  // What the user asked for: a short pass they chose is honoured, not quietly
  // rounded up to something the settings page never showed them.
  it("honours a pass shorter than the old five-minute floor", () => {
    eq(passMinutes(rule("Standard", { unlock: 2 }), CFG, 0), 2);
    eq(passMinutes(rule("Standard", { unlock: 1 }), CFG, 0), 1);
  });
});

describe("video hosts get double the pass", () => {
  it("youtube.com doubles", () =>
    eq(passMinutes(rule("Standard", { host: "youtube.com" }), CFG, 0), 30));
  it("a subdomain doubles too", () =>
    eq(passMinutes(rule("Standard", { host: "music.youtube.com" }), CFG, 0), 30));
  it("doubling applies before the cave penalty", () =>
    eq(passMinutes(rule("Standard", { host: "youtube.com" }), CFG, 2), 26));
  it("recognises the listed hosts", () => {
    for (const h of ["youtube.com", "vimeo.com", "twitch.tv", "netflix.com", "m.youtube.com"]) {
      ok(isVideoHost(h), h);
    }
  });
  it("does not fire on lookalikes", () => {
    for (const h of ["notyoutube.com", "youtubey.com", "instagram.com", "example.com"]) {
      ok(!isVideoHost(h), h);
    }
  });
});
