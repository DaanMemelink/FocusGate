// Toolbar popup: is the gate awake, and what has it cost today?
//
// This exists mostly to answer one question quickly. Outside its focus hours
// the extension does nothing at all, which is correct but indistinguishable
// from a broken install — so say so out loud.
import { loadSettings, getStats } from "../core/storage.js";
import { describeSchedule } from "../core/schedule.js";

const $ = (id) => document.getElementById(id);

async function render() {
  const settings = await loadSettings();
  const { awake, detail } = describeSchedule(settings);

  $("state").textContent = awake ? "Gate is awake" : "Gate is asleep";
  $("detail").textContent = detail;
  $("dot").classList.toggle("awake", awake);

  const stats = await getStats();
  const entries = Object.values(stats.rules || {});
  const cleared = entries.reduce((n, e) => n + (e.cleared || 0), 0);
  const minutes = entries.reduce((n, e) => n + (e.minutes || 0), 0);

  // A clean day gets no zeroes to look at.
  if (cleared > 0) {
    $("cleared").textContent = cleared;
    $("minutes").textContent = `${minutes} min`;
    $("tally").hidden = false;
  }
}

$("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

render();
