import { describe, it, eq, ok } from "./harness.js";
import {
  validateClipFile,
  formatBytes,
  formatDuration,
  MAX_CLIP_BYTES,
  LARGE_CLIP_BYTES,
  baseMimeType,
} from "../src/core/clips.js";
import { targetSize, keepSmaller, isStarved, TARGET_MAX_EDGE } from "../src/core/compress.js";

// validateClipFile only reads { name, size, type }, so it needs no real File.
const file = (over = {}) =>
  Object.assign({ name: "clip.mp4", size: 4 * 1024 * 1024, type: "video/mp4" }, over);

describe("clip validation", () => {
  it("accepts an ordinary mp4", () => eq(validateClipFile(file()).ok, true));
  it("accepts webm", () => eq(validateClipFile(file({ type: "video/webm" })).ok, true));
  it("accepts quicktime, which is what phones hand you", () =>
    eq(validateClipFile(file({ type: "video/quicktime" })).ok, true));

  it("accepts a type that carries codec parameters", () =>
    eq(validateClipFile(file({ type: "video/webm;codecs=vp9,opus" })).ok, true));

  it("accepts a type in the wrong case", () =>
    eq(validateClipFile(file({ type: "VIDEO/MP4" })).ok, true));

  it("does not let a parameter smuggle in an unplayable type", () =>
    eq(validateClipFile(file({ type: "application/pdf;name=video/mp4" })).ok, false));

  it("refuses a non-video", () => {
    const r = validateClipFile(file({ type: "image/png" }));
    eq(r.ok, false);
    ok(r.reason.includes("MP4"), "should say what to use instead");
  });
  it("refuses a file with no type at all", () =>
    eq(validateClipFile(file({ type: "" })).ok, false));
  it("refuses an empty file", () => eq(validateClipFile(file({ size: 0 })).ok, false));
  it("refuses nothing at all", () => eq(validateClipFile(null).ok, false));

  it("refuses a file over the hard limit", () => {
    const r = validateClipFile(file({ size: MAX_CLIP_BYTES * 2 }));
    eq(r.ok, false);
    ok(r.reason.includes("80 MB"), "should name the size: " + r.reason);
    ok(r.reason.includes("40 MB"), "should name the limit: " + r.reason);
  });

  it("does not tell a file it is over its own size", () => {
    // A hair over the line rounds to the limit itself.
    const r = validateClipFile(file({ size: MAX_CLIP_BYTES + 1 }));
    eq(r.ok, false);
    ok(!r.reason.includes("40 MB is over"), "reads as nonsense: " + r.reason);
    ok(r.reason.includes("just over the 40 MB limit"), r.reason);
  });
  it("accepts a file exactly at the limit", () =>
    eq(validateClipFile(file({ size: MAX_CLIP_BYTES })).ok, true));

  it("flags a large-but-allowed file rather than refusing it", () => {
    const r = validateClipFile(file({ size: LARGE_CLIP_BYTES + 1 }));
    eq(r.ok, true);
    eq(r.large, true);
  });
  it("does not flag a small file", () => eq(validateClipFile(file()).large, false));
});

describe("formatting", () => {
  it("bytes", () => eq(formatBytes(900), "900 B"));
  it("kilobytes", () => eq(formatBytes(2048), "2 KB"));
  it("megabytes", () => eq(formatBytes(5 * 1024 * 1024), "5 MB"));
  it("keeps a decimal that says something", () =>
    eq(formatBytes(2.25 * 1024 * 1024), "2.3 MB"));
  it("drops one that does not", () => eq(formatBytes(40 * 1024 * 1024), "40 MB"));
  it("handles nonsense", () => eq(formatBytes(undefined), "0 B"));

  it("seconds", () => eq(formatDuration(42), "42s"));
  it("minutes", () => eq(formatDuration(95), "1:35"));
  it("pads the seconds", () => eq(formatDuration(61), "1:01"));
  it("handles an unknown duration", () => eq(formatDuration(NaN), "—"));
  it("handles a zero duration", () => eq(formatDuration(0), "—"));
});

describe("compression target size", () => {
  it("caps the long edge of a landscape source", () => {
    eq(targetSize(1920, 1080), { width: 720, height: 406 });
  });
  it("caps the long edge of a portrait source", () => {
    const { width, height } = targetSize(1080, 1920);
    eq(height, TARGET_MAX_EDGE);
    ok(width < height, "portrait stays portrait");
  });
  it("never upscales something already small", () =>
    eq(targetSize(360, 640), { width: 360, height: 640 }));
  it("always returns even dimensions, which some encoders require", () => {
    for (const [w, h] of [[1919, 1079], [641, 361], [355, 633]]) {
      const t = targetSize(w, h);
      eq(t.width % 2, 0, `width ${t.width} from ${w}`);
      eq(t.height % 2, 0, `height ${t.height} from ${h}`);
    }
  });
});

describe("keeping whichever file is smaller", () => {
  const blob = (size) => ({ size });
  it("uses the re-encode when it wins", () => {
    const r = keepSmaller(blob(1000), blob(400));
    eq(r.usedCompressed, true);
    eq(r.blob.size, 400);
  });
  // Re-encoding an already-efficient file routinely makes it bigger, so this is
  // the common case rather than an edge case.
  it("keeps the original when the re-encode is bigger", () => {
    const r = keepSmaller(blob(400), blob(1000));
    eq(r.usedCompressed, false);
    eq(r.blob.size, 400);
  });
  it("keeps the original on a tie", () =>
    eq(keepSmaller(blob(500), blob(500)).usedCompressed, false));
  it("keeps the original when compression produced nothing", () =>
    eq(keepSmaller(blob(500), null).usedCompressed, false));
});

describe("mime type parameters", () => {
  it("strips parameters", () => eq(baseMimeType("video/webm;codecs=vp9,opus"), "video/webm"));
  it("trims whitespace", () => eq(baseMimeType(" video/mp4 ; x=1"), "video/mp4"));
  it("lowercases", () => eq(baseMimeType("VIDEO/MP4"), "video/mp4"));
  it("survives nothing at all", () => eq(baseMimeType(undefined), ""));
});

describe("detecting a starved re-encode", () => {
  // A hidden tab stops the frame callbacks, so the recorder is fed one still
  // image for the length of the clip.
  it("flags an encode that drew almost nothing", () =>
    eq(isStarved({ frames: 1, expectedFrames: 900 }), true));

  it("flags an encode that fell below half the frames due", () =>
    eq(isStarved({ frames: 449, expectedFrames: 900 }), true));

  it("passes an encode that merely dropped some frames", () =>
    eq(isStarved({ frames: 700, expectedFrames: 900 }), false));

  it("passes an encode that drew every frame", () =>
    eq(isStarved({ frames: 900, expectedFrames: 900 }), false));

  it("respects a stricter tolerance", () =>
    eq(isStarved({ frames: 700, expectedFrames: 900 }, 0.9), true));

  it("cannot judge a clip of unknown length, so does not", () =>
    eq(isStarved({ frames: 0, expectedFrames: 0 }), false));

  it("survives no result at all", () => eq(isStarved(null), false));
});
