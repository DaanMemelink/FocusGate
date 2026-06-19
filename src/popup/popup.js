const $ = (id) => document.getElementById(id);

async function render() {
  const s = await Focus.getSettings();
  const active = Focus.isWithinSchedule(s.schedule);

  $("dot").classList.toggle("on", active);
  $("state").textContent = active ? "Focus hours active" : "Outside focus hours";

  const count = s.blockedSites.length;
  $("detail").textContent =
    `${count} site${count === 1 ? "" : "s"} · ${s.schedule.start}–${s.schedule.end}`;
}

$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
render();
