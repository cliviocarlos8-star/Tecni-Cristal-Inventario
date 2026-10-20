import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auth = await readFile(new URL("../app/inventory-auth.tsx", import.meta.url), "utf8");
const mobile = await readFile(new URL("../app/mobile-inventory-app.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("mobile and desktop mount as separate authenticated experiences", () => {
  assert.match(auth, /matchMedia\("\(max-width: 820px\)"\)/);
  assert.match(auth, /if \(mobileLayout\)/);
  assert.match(auth, /<MobileInventoryApp/);
  assert.match(auth, /return \(\s*<main\s*className=\{`shell/);
});

test("mobile navigation exposes the five operational destinations", () => {
  for (const label of ["Inicio", "Inventario", "Obras", "Catálogo", "Más"])
    assert.match(mobile, new RegExp(`label:\\"${label}\\"`));
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /100dvh/);
});

test("mobile data is loaded once and large technical catalog pagination remains isolated", () => {
  assert.equal((mobile.match(/Promise\.all\(/g) || []).length, 1);
  assert.doesNotMatch(mobile, /catalog-index\.json/);
  assert.match(mobile, /\.limit\(80\)/);
  assert.match(mobile, /api\/catalog-detail/);
  assert.match(mobile, /loading=\"lazy\"/);
});

test("material actions preserve the selected product in the official movement flow", () => {
  assert.match(mobile, /onLaunch\(\"movement\",undefined,product\.id\)/);
  assert.match(mobile, /setFlow\(\{action,locationId:id,productId/);
  assert.match(mobile, /<MovementModule role=\{role\} preset=\{flow\}/);
});
