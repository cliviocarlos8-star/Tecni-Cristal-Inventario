import catalogIndex from "./catalog-index.json";
import thumbnailMap from "./catalog-thumbnail-map.json";
import listImageMap from "./catalog-list-image-map.json";
import detailImageMap from "./catalog-detail-image-map.json";

export type CatalogListItem = {
  catalog_item_id: string;
  code: string;
  name: string;
  line: string;
  category: string;
  weight: string | null;
  typology: string | null;
  thumbnail_url: string;
  list_image_url: string;
};

export type CatalogOfflineItem = CatalogListItem & {
  lines: string[];
  color: string;
};

type CatalogSourceItem = CatalogOfflineItem & {
  active: boolean;
  catalog_url: string;
};

export type CatalogDetailItem = CatalogOfflineItem & {
  image_url: string;
  catalog_url: string;
};

export const CATALOG_PAGE_SIZE = 40;

const activeItems = (catalogIndex as CatalogSourceItem[]).filter((item) => item.active);

function localThumbnail(url: string) {
  return (thumbnailMap as Record<string, string>)[url] || url;
}

function localListImage(url: string) {
  return (listImageMap as Record<string, string>)[url] || localThumbnail(url);
}

function localDetailImage(url: string) {
  return (detailImageMap as Record<string, string>)[url] || url;
}

function toListItem({ catalog_item_id, code, name, line, category, weight, typology, thumbnail_url }: CatalogSourceItem): CatalogListItem {
  return { catalog_item_id, code, name, line, category, weight, typology, thumbnail_url: localThumbnail(thumbnail_url), list_image_url: localListImage(thumbnail_url) };
}

function toOfflineItem(item: CatalogSourceItem): CatalogOfflineItem {
  return { ...toListItem(item), lines: item.lines, color: item.color };
}

function catalogHash() {
  let hash = 2166136261;
  for (const item of activeItems) {
    const value = `${item.catalog_item_id}|${item.code}|${item.name}|${item.line}|${item.lines.join(",")}|${item.category}|${item.typology || ""}|${item.weight || ""}|${item.color}|${localThumbnail(item.thumbnail_url)}|${localListImage(item.thumbnail_url)}`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const catalogVersion = `tc-${activeItems.length}-${catalogHash()}`;
export const catalogSnapshot = activeItems.map(toOfflineItem);

export const catalogLines = Array.from(new Set(activeItems.flatMap((item) => item.lines))).sort(
  (a, b) => a.localeCompare(b, "es"),
);

export const catalogCategories = Array.from(new Set(activeItems.map((item) => item.category))).sort(
  (a, b) => a.localeCompare(b, "es"),
);

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim().replace(/\s+/g, " ");
}

function matches(item: CatalogSourceItem, query: string) {
  const needle = normalize(query);
  if (!needle) return true;
  const haystack = normalize([item.code, item.name, item.line, item.lines.join(" "), item.category, item.typology, item.color].filter(Boolean).join(" "));
  return haystack.includes(needle) || haystack.replace(/[^a-z0-9]/g, "").includes(needle.replace(/[^a-z0-9]/g, ""));
}

export function queryCatalog({ query = "", line = "Todas", category = "Todos", offset = 0, limit = CATALOG_PAGE_SIZE }: { query?: string; line?: string; category?: string; offset?: number; limit?: number }) {
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.min(Math.max(1, limit), CATALOG_PAGE_SIZE);
  const lineItems = activeItems.filter((item) => line === "Todas" || item.lines.includes(line));
  const filtered = lineItems.filter((item) => (category === "Todos" || item.category === category) && matches(item, query));
  const items = filtered.slice(safeOffset, safeOffset + safeLimit).map(toListItem);
  return { items, total: filtered.length, selectionTotal: lineItems.length, hasMore: safeOffset + safeLimit < filtered.length, nextOffset: safeOffset + safeLimit };
}

export function getCatalogItem(id: string) {
  return activeItems.find((item) => item.catalog_item_id === id);
}

export function getCatalogDetail(id: string): CatalogDetailItem | null {
  const item = getCatalogItem(id);
  if (!item) return null;
  return {
    ...toOfflineItem(item),
    image_url: localDetailImage(item.thumbnail_url),
    catalog_url: item.catalog_url,
  };
}

export const catalogTotal = activeItems.length;
