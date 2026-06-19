// Host parsing + matching.
(function (root) {
  const Focus = (root.Focus = root.Focus || {});

  // Turn user input ("https://www.YouTube.com/feed", "  Instagram.com ") into a
  // bare lowercase host ("youtube.com", "instagram.com").
  Focus.normalizeHost = function (input) {
    let s = String(input).trim().toLowerCase();
    s = s.replace(/^[a-z]+:\/\//, ""); // strip scheme
    s = s.split("/")[0]; // strip path
    s = s.split("?")[0].split("#")[0]; // strip query / fragment
    s = s.split(":")[0]; // strip port
    s = s.replace(/^www\./, ""); // strip leading www.
    return s;
  };

  // Does a page host match a configured site? Matches the exact host and any
  // subdomain (so "youtube.com" also blocks "m.youtube.com").
  Focus.hostMatches = function (host, site) {
    host = String(host).toLowerCase().replace(/^www\./, "");
    site = Focus.normalizeHost(site);
    if (!site) return false;
    return host === site || host.endsWith("." + site);
  };

  Focus.isBlockedHost = function (host, blockedSites) {
    return (blockedSites || []).some((site) => Focus.hostMatches(host, site));
  };
})(globalThis);
