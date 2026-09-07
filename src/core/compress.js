// Optional re-encode for uploaded clips.
//
// There is no dependency-free way to transcode video in a browser except to
// play it and record the output, so this runs in REAL TIME: a 40-second clip
// takes 40 seconds. That is the honest cost, and the UI says so rather than
// pretending otherwise. ffmpeg.wasm would be faster and is ~30 MB of
// dependency, which this project does not have and should not acquire for a
// convenience.
//
// Two guards make it safe to offer:
//   - unsupported browsers are detected up front, not mid-encode
//   - the result is only kept if it is actually smaller, because re-encoding
//     an already-efficient file usually is not
//
// Audio is routed through Web Audio into a stream destination and deliberately
// never connected to the speakers, so encoding is silent. Creating a
// MediaElementSource also detaches the element from the default output, which
// is what stops the clip blaring out of the settings page while it works.

// Long edge of the output. The gate shows clips in a box a few hundred pixels
// across, so anything above this is detail nobody sees.
export const TARGET_MAX_EDGE = 720;
const TARGET_BITRATE = 1_200_000;
const FPS = 30;

// Preference order. VP9 is markedly better per bit than VP8; whichever the
// browser admits to supporting is used.
const CANDIDATE_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

export function canCompress() {
  return Boolean(
    typeof MediaRecorder !== "undefined" &&
      typeof HTMLCanvasElement !== "undefined" &&
      HTMLCanvasElement.prototype.captureStream &&
      pickMimeType()
  );
}

// Output dimensions for a source, capped on the long edge and rounded to even
// numbers because some encoders reject odd ones.
export function targetSize(width, height, maxEdge = TARGET_MAX_EDGE) {
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

// Returns { blob, mimeType, width, height } — or throws. The caller decides
// whether to keep it; see keepSmaller below.
export async function compressVideo(source, { maxEdge = TARGET_MAX_EDGE, onProgress } = {}) {
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error("This browser cannot re-encode video.");

  const url = URL.createObjectURL(source);
  const video = document.createElement("video");
  video.src = url;
  video.playsInline = true;
  // Not muted: the audio is pulled through Web Audio below. Muting here would
  // silence the captured track too.
  video.preload = "auto";

  let audioCtx = null;
  const cleanup = () => {
    try {
      video.pause();
    } catch {
      /* already gone */
    }
    if (audioCtx) audioCtx.close().catch(() => {});
    URL.revokeObjectURL(url);
  };

  try {
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("Could not decode that file.")), {
        once: true,
      });
    });

    const { width, height } = targetSize(video.videoWidth, video.videoHeight, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const stream = canvas.captureStream(FPS);

    // Pull the audio out without letting it reach the speakers.
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const destination = audioCtx.createMediaStreamDestination();
      audioCtx.createMediaElementSource(video).connect(destination);
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
    } catch {
      // A clip with no audio track, or a browser that refuses. Video-only
      // output is still a perfectly good result.
    }

    // Frames actually painted onto the canvas. Compared against the frames the
    // clip should have produced; see isStarved below.
    let frames = 0;

    const chunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: TARGET_BITRATE,
    });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const finished = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = () => reject(new Error("Encoding failed."));
    });

    recorder.start(1000);
    await video.play();

    const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      frames++;
      ctx.drawImage(video, 0, 0, width, height);
      if (onProgress && total) onProgress(Math.min(1, video.currentTime / total));
      // requestVideoFrameCallback fires per decoded frame and keeps running
      // when rAF would be throttled; rAF is the fallback.
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };
    draw();

    await new Promise((resolve) => video.addEventListener("ended", resolve, { once: true }));
    stopped = true;
    recorder.stop();
    await finished;

    if (onProgress) onProgress(1);
    return {
      blob: new Blob(chunks, { type: mimeType }),
      mimeType,
      width,
      height,
      frames,
      expectedFrames: Math.round(total * FPS),
    };
  } finally {
    cleanup();
  }
}

// A hidden tab stops firing frame callbacks, so the canvas goes on handing the
// recorder the same still image. The encode still runs to the end and still
// "succeeds" — it just contains one frame held for thirty seconds, and being
// almost empty it is comfortably smaller than the original, so a size check
// alone would keep it. Counting frames drawn against frames due catches that,
// and any other stall, for the price of an integer.
export function isStarved(result, tolerance = 0.5) {
  if (!result || !result.expectedFrames) return false;
  return result.frames < result.expectedFrames * tolerance;
}

// Re-encoding a well-compressed file often makes it bigger. Keeping whichever
// is smaller means the option can never make things worse.
export function keepSmaller(original, compressed) {
  if (!compressed || compressed.size >= original.size) {
    return { blob: original, usedCompressed: false };
  }
  return { blob: compressed, usedCompressed: true };
}
