import catalogIndex from "./catalog-index.json";
import type { CatalogItem } from "./catalog-material-picker";

export const activeCatalogItems = (catalogIndex as CatalogItem[]).filter(
  (item) => item.active,
);

export function catalogUnit(item: CatalogItem) {
  if (
    [
      "Tipos de vidrio",
      "Vidrios de control solar",
      "Paneles ACM",
      "Acabados decorativos",
    ].includes(item.category)
  )
    return { code: "M2", allows_decimals: true };
  if (["Perfiles", "Felpudos y guarniciones"].includes(item.category))
    return { code: "M", allows_decimals: true };
  return { code: "UN", allows_decimals: false };
}

export function catalogProductType(item: CatalogItem) {
  if (item.category === "Perfiles") return "PERFIL";
  if (item.category.includes("Vidrio")) return "VIDRIO";
  if (item.category.includes("Herrajes")) return "HERRAJE";
  return "MATERIAL";
}

export function catalogDescription(item: CatalogItem) {
  return `Catálogo técnico · ${item.line}${item.typology ? ` · ${item.typology}` : ""}`;
}

