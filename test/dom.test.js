import { describe, it, ok } from "./harness.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Every $("some-id") in a page script must correspond to an element in that
// page's HTML.
//
// This exists because of a real bug: an element was removed from the settings
// markup while a render function still reached for it. That threw partway
// through render(), so everything after the throw — including the line that
// shows the save bar — silently stopped running, and settings could no longer
// be saved. Nothing else in the suite could see it, because it only happens in
// a DOM.
const read = (p) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");

const PAGES = [
  ["gate", "src/gate/gate.html", "src/gate/gate.js"],
  ["options", "src/options/options.html", "src/options/options.js"],
  ["popup", "src/popup/popup.html", "src/popup/popup.js"],
];

for (const [name, htmlPath, jsPath] of PAGES) {
  describe(`${name} page`, () => {
    const html = read(htmlPath);
    const js = read(jsPath);

    const declared = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const referenced = [...js.matchAll(/\$\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);

    it("references at least one element, so the scan is actually working", () =>
      ok(referenced.length > 0, `no $("…") calls found in ${jsPath}`));

    for (const id of [...new Set(referenced)]) {
      it(`has an element for $("${id}")`, () =>
        ok(declared.has(id), `${jsPath} reaches for #${id}, which ${htmlPath} does not define`));
    }
  });
}
