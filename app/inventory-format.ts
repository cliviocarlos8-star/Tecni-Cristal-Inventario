export type InventoryUnit = {
  code?: string | null;
  allows_decimals?: boolean | null;
} | null;

export type MovementQuantityItem = {
  quantity: number;
  product?: { unit?: InventoryUnit } | null;
};

export function isWholeUnit(unit: InventoryUnit) {
  return unit?.allows_decimals === false || unit?.code?.toUpperCase() === "UN";
}

export function formatInventoryQuantity(value: number, unit: InventoryUnit) {
  const numeric = Number(value) || 0;
  const digits = isWholeUnit(unit) ? 0 : 3;
  return new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(numeric);
}

export function formatQuantityWithUnit(value: number, unit: InventoryUnit) {
  const numeric = Number(value) || 0;
  const code = unit?.code?.toUpperCase() || "";
  if (isWholeUnit(unit) && numeric !== 0 && Math.round(numeric) === 0) {
    return `<1${code ? ` ${code}` : ""}`;
  }
  return `${formatInventoryQuantity(numeric, unit)}${code ? ` ${code}` : ""}`;
}

export function summarizeMovementQuantity(items: MovementQuantityItem[]) {
  if (!items.length) return "Sin materiales";
  const units = new Set(
    items.map((item) => item.product?.unit?.code?.toUpperCase() || ""),
  );
  if (units.size !== 1 || units.has("")) {
    return `${items.length} ${items.length === 1 ? "producto" : "productos"}`;
  }
  const unit = items[0].product?.unit || null;
  const total = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  return formatQuantityWithUnit(total, unit);
}

export function countPositiveStocks<T extends { quantity: number }>(rows: T[]) {
  return rows.filter((row) => Number(row.quantity) > 0).length;
}

export type StockAlertLevel = "critical" | "warning" | null;

/**
 * A product only participates in replenishment alerts when a positive minimum
 * was configured. This keeps catalog-only products at stock 0 from becoming
 * false alerts while ensuring that "sin stock" is counted as critical.
 */
export function stockAlertLevel(
  quantityValue: number,
  minimumValue: number,
): StockAlertLevel {
  const quantity = Number(quantityValue) || 0;
  const minimum = Number(minimumValue) || 0;
  if (minimum <= 0) return null;
  if (quantity <= minimum) return "critical";
  const warningLimit = Math.max(minimum * 1.25, minimum + 1);
  return quantity <= warningLimit ? "warning" : null;
}

export function requiresReplenishment(
  quantityValue: number,
  minimumValue: number,
) {
  return stockAlertLevel(quantityValue, minimumValue) === "critical";
}

export const INVENTORY_MOVEMENT_LABELS: Record<string, string> = {
  COMPRA: "Compra / entrada",
  COMPRA_DIRECTA: "Compra directa a obra",
  SALIDA_OBRA: "Salida a obra",
  DEVOLUCION_OBRA: "Devolución de obra",
  CONSUMO: "Consumo / instalación",
  AJUSTE_ENTRADA: "Ajuste de entrada",
  AJUSTE_SALIDA: "Ajuste de salida",
  TRANSFERENCIA: "Transferencia",
};

export type MovementFlow = "in" | "out" | "transfer";

export function movementFlow(type: string): MovementFlow {
  if (["SALIDA_OBRA", "CONSUMO", "AJUSTE_SALIDA"].includes(type)) return "out";
  if (type === "TRANSFERENCIA") return "transfer";
  return "in";
}

export function isPurchaseMovement(type: string) {
  return type === "COMPRA" || type === "COMPRA_DIRECTA";
}
