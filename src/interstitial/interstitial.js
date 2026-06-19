// The gate page. The service worker redirects blocked navigations here with the
// original URL in `?target=`. This is also where the future math/puzzle check
// will live — gate the "Continue" action behind solving it.
const params = new URLSearchParams(location.search);
const target = params.get("target") || "";

let host = "";
try {
  host = Focus.normalizeHost(new URL(target).hostname);
} catch (_) {
  /* malformed or missing target */
}

document.getElementById("host").textContent = host || "this site";

document.getElementById("continue").addEventListener("click", async () => {
  const settings = await Focus.getSettings();
  if (host) await Focus.grantPass(host, settings.graceMinutes);
  // replace() so the gate doesn't sit in history between the previous page
  // and the target.
  if (target) location.replace(target);
  else history.back();
});

document.getElementById("back").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else location.replace("about:blank");
});
