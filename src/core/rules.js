// Which rule governs a URL.
//
// A rule is `{ host, path, level, wait, unlock }`, where `path` is an optional
// prefix so parts of one site can differ — youtube.com Light, but
// youtube.com/shorts Standard. Everything here is pure: no DOM, no chrome.*,
// so test/rules.test.js can exercise it directly.

// Host labels count for far more than characters, so an exact subdomain rule
// always outranks anything written against the parent domain. Within the same
// host, the longer path wins. This single number orders matching *and* the
// match-order badges in settings, so the two can never disagree.
export function specificity(rule) {
  const host = String(rule.host || "");
  const path = String(rule.path || "");
  return host.split(".").length * 1000 + host.length * 10 + path.length;
}

// "https://www.YouTube.com/Shorts/" -> { host: "youtube.com", path: "/shorts" }
export function parsePattern(input) {
  let s = String(input || "").trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "");
  s = s.split("?")[0].split("#")[0];

  const cut = s.indexOf("/");
  const host = (cut === -1 ? s : s.slice(0, cut)).split(":")[0].replace(/^www\./, "");
  return { host, path: normalizePath(cut === -1 ? "" : s.slice(cut)) };
}

// Trailing slashes carry no meaning, and "/" is the same as no path at all.
export function normalizePath(input) {
  const s = String(input || "").trim().toLowerCase().replace(/\/+$/, "");
  if (!s || s === "/") return "";
  return s.startsWith("/") ? s : "/" + s;
}

export function normalizeHost(input) {
  return String(input || "").trim().toLowerCase().replace(/^www\./, "").split(":")[0];
}

// Exact host or any subdomain, so youtube.com also covers m.youtube.com.
export function hostMatches(host, ruleHost) {
  const h = normalizeHost(host);
  const r = normalizeHost(ruleHost);
  if (!r) return false;
  return h === r || h.endsWith("." + r);
}

// Segment-aware, for the same reason host matching is: "/shorts" must cover
// "/shorts/abc" but never "/shortstories".
export function pathMatches(pathname, rulePath) {
  if (!rulePath) return true;
  const p = normalizePath(pathname) || "/";
  return p === rulePath || p.startsWith(rulePath + "/");
}

// The single rule that governs `url`, or null. Highest specificity wins, so the
// order of the rule list never decides anything.
export function matchRule(url, rules) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = normalizeHost(parsed.hostname);
  let best = null;
  let bestScore = -1;

  for (const rule of rules || []) {
    if (!hostMatches(host, rule.host)) continue;
    if (!pathMatches(parsed.pathname, rule.path)) continue;
    const score = specificity(rule);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

// A rule's identity. Passes and per-day counters are keyed by THIS, never by
// the host: with youtube.com on Light and youtube.com/shorts on Standard, a
// host key would let the cheap gate on /watch hand out an unlock that also
// covered /shorts.
export function ruleKey(rule) {
  return rule ? String(rule.host || "") + String(rule.path || "") : "";
}

export function isAllowed(rule) {
  return Boolean(rule) && rule.level === "Allowed";
}

// Should this URL be gated at all? "Allowed" short-circuits, and a URL no rule
// matches was never in scope.
export function shouldGate(url, rules) {
  const rule = matchRule(url, rules);
  return Boolean(rule) && !isAllowed(rule);
}

// The registrable domain a rule competes within — the last two host labels.
export function domainOf(rule) {
  return String(rule.host || "").split(".").slice(-2).join(".");
}

// Rules bucketed by the domain they compete within, each bucket ordered most
// specific first. Rules on different domains can never match the same URL, so
// they never compete; only a bucket's internal order is meaningful, and that
// order is derived, not stored.
//
// Returns [{ domain, entries: [{ rule, index, badge }] }], sorted by domain so
// the list is stable across renders. `index` is the position in the original
// array, which is what edit callbacks need.
export function groupRules(rules) {
  const buckets = new Map();
  (rules || []).forEach((rule, index) => {
    const domain = domainOf(rule);
    if (!buckets.has(domain)) buckets.set(domain, []);
    buckets.get(domain).push({ rule, index });
  });

  return [...buckets.keys()].sort().map((domain) => {
    const entries = buckets.get(domain);
    entries.sort((a, b) => specificity(b.rule) - specificity(a.rule));
    entries.forEach((entry, n) => {
      // A lone rule competes with nothing, so a number would imply an ordering
      // that does not exist.
      entry.badge = entries.length > 1 ? String(n + 1).padStart(2, "0") : "·";
    });
    return { domain, entries };
  });
}

// Flat index -> badge, for callers that just want the label.
export function matchOrderBadges(rules) {
  const badges = {};
  for (const group of groupRules(rules)) {
    for (const entry of group.entries) badges[entry.index] = entry.badge;
  }
  return badges;
}
