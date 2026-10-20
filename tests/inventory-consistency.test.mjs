import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const formatSource = await readFile(
  new URL("../app/inventory-format.ts", import.meta.url),
  "utf8",
);
const dashboardSource = await readFile(
  new URL("../app/dashboard-module.tsx", import.meta.url),
  "utf8",
);
const alertsSource = await readFile(
  new URL("../app/stock-alerts-module.tsx", import.meta.url),
  "utf8",
);
const movementsSource = await readFile(
  new URL("../app/movement-module.tsx", import.meta.url),
  "utf8",
);
const reportsSource = await readFile(
  new URL("../app/report-module.tsx", import.meta.url),
  "utf8",
);

test("all stock summaries use the shared replenishment rule", () => {
  assert.match(formatSource, /minimum <= 0/);
  assert.match(formatSource, /quantity <= minimum/);
  assert.match(dashboardSource, /requiresReplenishment/);
  assert.match(alertsSource, /stockAlertLevel/);
  assert.match(movementsSource, /requiresReplenishment/);
});

test("dashboard stock-low KPI includes zero-stock products requiring replenishment", () => {
  assert.match(dashboardSource, /value=\{formatNumber\(attention\.length\)\}/);
  assert.match(dashboardSource, /Incluye productos sin stock/);
  assert.doesNotMatch(dashboardSource, /item\.quantity > 0 && item\.quantity <=/);
});

test("alerts sort by actual quantity instead of a no-op comparison", () => {
  assert.match(alertsSource, /a\.quantity-b\.quantity/);
  assert.doesNotMatch(alertsSource, /a\.quantity-a\.quantity/);
});

test("movement and report modules cover modern location-based flows", () => {
  assert.match(movementsSource, /id,sku,name,min_stock/);
  assert.match(movementsSource, /item\.location\.warehouse_id === warehouse\.id/);
  assert.match(reportsSource, /source_location:inventory_locations/);
  assert.match(reportsSource, /destination_location:inventory_locations/);
  assert.match(reportsSource, /isPurchaseMovement/);
  assert.match(reportsSource, /movementFlow/);
});

test("every canonical movement type is represented in shared labels", () => {
  for (const type of [
    "COMPRA",
    "COMPRA_DIRECTA",
    "SALIDA_OBRA",
    "DEVOLUCION_OBRA",
    "CONSUMO",
    "AJUSTE_ENTRADA",
    "AJUSTE_SALIDA",
    "TRANSFERENCIA",
  ]) assert.match(formatSource, new RegExp(`\\b${type}\\b`));
});
