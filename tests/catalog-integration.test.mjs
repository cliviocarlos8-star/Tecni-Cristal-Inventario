import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(
  await readFile(new URL("../app/catalog-index.json", import.meta.url), "utf8"),
).filter((item) => item.active);
const thumbnailMap = JSON.parse(
  await readFile(new URL("../app/catalog-thumbnail-map.json", import.meta.url), "utf8"),
);
const listImageMap = JSON.parse(
  await readFile(new URL("../app/catalog-list-image-map.json", import.meta.url), "utf8"),
);
const detailImageMap = JSON.parse(
  await readFile(new URL("../app/catalog-detail-image-map.json", import.meta.url), "utf8"),
);

test("the complete technical catalog is active and uniquely addressable", () => {
  assert.equal(catalog.length, 1291);
  assert.equal(new Set(catalog.map((item) => item.catalog_item_id)).size, 1291);
  assert.equal(new Set(catalog.map((item) => item.code.toUpperCase())).size, 1291);
});

test("the app switcher uses the canonical internal technical catalog route", async () => {
  const inventorySource = await readFile(
    new URL("../app/inventory-auth.tsx", import.meta.url),
    "utf8",
  );
  const catalogSource = await readFile(
    new URL("../app/technical-catalog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(inventorySource, /href="\/catalogo-tecnico"/);
  assert.match(catalogSource, /href="\/"/);
  assert.doesNotMatch(inventorySource, /target="_blank"/);
});

test("the technical catalog sends only a paginated slice to the browser", async () => {
  const catalogSource = await readFile(new URL("../app/technical-catalog.tsx", import.meta.url), "utf8");
  const dataSource = await readFile(new URL("../app/catalog-data.ts", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../app/api/catalog/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(catalogSource, /catalog-index\.json/);
  assert.match(dataSource, /CATALOG_PAGE_SIZE = 40/);
  assert.match(routeSource, /queryCatalog/);
  assert.match(catalogSource, /loading="lazy"/);
  assert.match(catalogSource, /decoding="async"/);
  assert.match(catalogSource, /setTimeout\(\(\) => setDebouncedQuery\(query\.trim\(\)\), 300\)/);
});

test("every catalog image has a local optimized thumbnail", () => {
  for (const item of catalog) {
    assert.match(thumbnailMap[item.thumbnail_url], /^\/catalog-thumbnails\/[a-f0-9]{8}\.webp$/);
  }
});

test("every catalog image has responsive list and detail variants", () => {
  for (const item of catalog) {
    assert.match(listImageMap[item.thumbnail_url], /^\/catalog-list-images\/[a-f0-9]{8}\.webp$/);
    assert.match(detailImageMap[item.thumbnail_url], /^\/catalog-detail-images\/[a-f0-9]{8}\.webp$/);
  }
});

test("catalog cards open a lightweight technical detail", async () => {
  const catalogSource = await readFile(new URL("../app/technical-catalog.tsx", import.meta.url), "utf8");
  const detailSource = await readFile(new URL("../app/catalog-detail-sheet.tsx", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../app/api/catalog-detail/route.ts", import.meta.url), "utf8");
  assert.match(catalogSource, /setSelectedItem\(item\)/);
  assert.match(detailSource, /api\/catalog-detail/);
  assert.match(detailSource, /Peso \/ medida/);
  assert.match(catalogSource, /srcSet=/);
  assert.match(detailSource, /detail\?\.image_url/);
  assert.match(routeSource, /getCatalogDetail/);
});

test("mobile filters, line shortcuts and quick action escape clipped containers", async () => {
  const catalogSource = await readFile(new URL("../app/technical-catalog.tsx", import.meta.url), "utf8");
  const quickAction = await readFile(new URL("../app/quick-inventory-action.tsx", import.meta.url), "utf8");
  assert.match(catalogSource, /technical-catalog-lines-trigger/);
  assert.match(catalogSource, /technical-catalog-line-grid/);
  assert.match(catalogSource, /technical-catalog-filter-backdrop/);
  assert.match(quickAction, /createPortal/);
  assert.match(quickAction, /document\.body/);
});

test("the application exposes an installable standalone PWA", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.equal(manifest.name, "Tecni Cristal");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/catalogo-tecnico?source=pwa");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(worker, /CACHE_CATALOG_THUMBNAILS/);
});

test("offline catalog uses IndexedDB while authenticated API data stays outside caches", async () => {
  const offline = await readFile(new URL("../app/catalog-offline.ts", import.meta.url), "utf8");
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const catalogData = await readFile(new URL("../app/catalog-data.ts", import.meta.url), "utf8");
  assert.match(offline, /indexedDB\.open/);
  assert.match(offline, /queryOfflineCatalog/);
  assert.match(catalogData, /catalogVersion/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(worker, /supabase/);
});

test("every catalog material has the fields required by inventory flows", () => {
  for (const item of catalog) {
    assert.ok(item.catalog_item_id.startsWith("catalog:"));
    assert.ok(item.code.trim());
    assert.ok(item.name.trim());
    assert.ok(item.category.trim());
    assert.ok(item.line.trim());
  }
});

test("all movement flows share the catalog material picker", async () => {
  const source = await readFile(
    new URL("../app/movement-module.tsx", import.meta.url),
    "utf8",
  );
  for (const type of [
    "COMPRA",
    "TRANSFERENCIA",
    "CONSUMO",
    "AJUSTE_ENTRADA",
    "AJUSTE_SALIDA",
  ])
    assert.match(source, new RegExp(`\\b${type}\\b`));
  assert.match(source, /<CatalogMaterialPicker/);
  assert.match(source, /post_location_inventory_movement/);
});

test("work stock exposes catalog materials only when zero stock is requested", async () => {
  const source = await readFile(
    new URL("../app/work-inventory-detail.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /if \(showZero\) \{/);
  assert.match(source, /activeCatalogItems\.forEach/);
  assert.match(source, /Number\(x\.quantity\) > 0/);
});
