const $ = (id) => document.getElementById(id);
const sitesList = () => $("sites-list");

// Build one editable row (input + remove button) and return its input element.
function addSiteRow(value) {
  const row = document.createElement("div");
  row.className = "site-row";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "site-input";
  input.placeholder = "example.com";
  input.value = value || "";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.setAttribute("aria-label", "Remove site");
  remove.textContent = "×";
  remove.addEventListener("click", () => row.remove());

  row.append(input, remove);
  sitesList().appendChild(row);
  return input;
}

// Read every row, normalize hosts, drop blanks and duplicates.
function readSites() {
  const seen = new Set();
  const sites = [];
  sitesList()
    .querySelectorAll(".site-input")
    .forEach((el) => {
      const host = Focus.normalizeHost(el.value);
      if (host && !seen.has(host)) {
        seen.add(host);
        sites.push(host);
      }
    });
  return sites;
}

async function load() {
  const s = await Focus.getSettings();

  sitesList().innerHTML = "";
  const sites = s.blockedSites || [];
  if (sites.length === 0) addSiteRow("");
  else sites.forEach((site) => addSiteRow(site));

  $("start").value = s.schedule.start;
  $("end").value = s.schedule.end;
  $("grace").value = s.graceMinutes;
}

async function save() {
  const settings = {
    blockedSites: readSites(),
    schedule: {
      start: $("start").value || "00:00",
      end: $("end").value || "00:00",
    },
    graceMinutes: Math.max(0, Number($("grace").value) || 0),
  };

  await Focus.saveSettings(settings);

  const status = $("status");
  status.textContent = "Saved ✓";
  setTimeout(() => (status.textContent = ""), 1500);
}

$("add-site").addEventListener("click", () => addSiteRow("").focus());
$("save").addEventListener("click", save);
load();
