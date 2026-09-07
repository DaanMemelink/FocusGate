import { describe, it, eq, ok } from "./harness.js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL("../" + p, import.meta.url));
const manifest = JSON.parse(readFileSync(root("manifest.json"), "utf8"));

// A malformed manifest is a hard store rejection, and the failure mode in the
// browser is a silently dead extension. Cheap to check here instead.
describe("manifest", () => {
  it("is Manifest V3", () => eq(manifest.manifest_version, 3));

  it("has a version the store will accept", () => {
    ok(/^\d+(\.\d+){0,3}$/.test(manifest.version), `bad version: ${manifest.version}`);
  });

  it("has a description within the store's 132-character limit", () => {
    ok(manifest.description, "description is required");
    ok(manifest.description.length <= 132, `${manifest.description.length} chars`);
  });

  it("declares every icon size the store and toolbar want", () => {
    for (const size of ["16", "32", "48", "128"]) {
      ok(manifest.icons[size], `missing icons.${size}`);
      ok(existsSync(root(manifest.icons[size])), `missing file ${manifest.icons[size]}`);
    }
  });

  it("uses the same icons on the toolbar action", () => {
    eq(manifest.action.default_icon, manifest.icons);
  });

  it("points at files that exist", () => {
    const referenced = [
      manifest.background.service_worker,
      manifest.options_ui.page,
      manifest.action.default_popup,
      ...(manifest.content_scripts || []).flatMap((c) => c.js),
    ];
    for (const p of referenced) ok(existsSync(root(p)), `missing ${p}`);
  });

  it("loads the worker as a module, since it imports src/core", () => {
    eq(manifest.background.type, "module");
  });

  // Reviewers weigh every permission. Anything beyond these three needs a reason
  // in STORE.md before it goes in.
  it("asks for no more permissions than it uses", () => {
    eq(manifest.permissions.slice().sort(), ["alarms", "storage", "webNavigation"]);
  });

  // The store flags an extension that can reach any site and puts it through a
  // slower review. Nothing here needs to: webNavigation reports URLs on its own
  // permission, and tabs.update redirects without one. Both ways of asking for
  // site access are checked, because the dashboard treats a content script's
  // match pattern as a host permission just as much as the manifest key does.
  it("asks for access to no site at all", () => {
    eq(manifest.host_permissions, undefined, "host_permissions widens the review");
    eq(manifest.optional_host_permissions, undefined, "so does asking for them later");
    eq(manifest.content_scripts, undefined, "a match pattern counts as a host permission");
  });

  it("does not ask to read tab URLs, titles or favicons", () => {
    ok(!manifest.permissions.includes("tabs"), "tabs is not needed to redirect a tab");
  });
});

describe("shipped config", () => {
  const config = JSON.parse(readFileSync(root("config/defaults.json"), "utf8"));

  it("gates out of the box", () => eq(config.always, true));

  it("only lists clips that are actually present", () => {
    for (const clip of config.clipFiles || []) {
      ok(existsSync(root(clip)), `clipFiles references a missing file: ${clip}`);
    }
  });
});
