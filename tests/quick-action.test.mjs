import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/quick-inventory-action.tsx", import.meta.url), "utf8");

test("quick actions use the official atomic movement service", () => {
  assert.match(source, /post_location_inventory_movement/);
  assert.match(source, /p_source_location_id/);
  assert.match(source, /p_destination_location_id/);
  assert.match(source, /Stock insuficiente/);
});

test("quick actions preserve catalog, work and deep-detail integration", () => {
  assert.match(source, /CatalogMaterialPicker/);
  assert.match(source, /SR-/);
  assert.match(source, /ER-/);
  assert.match(source, /openMovementDetail\(success\.id\)/);
  assert.match(source, /location_type===\"PROJECT\"/);
});
