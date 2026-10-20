import type { CatalogOfflineItem } from "./catalog-data";

const DB_NAME = "tecni-cristal-offline";
const DB_VERSION = 1;
const ITEMS = "catalog-items";
const META = "metadata";

type CatalogMeta = { key: "catalog"; version: string; syncedAt: string };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ITEMS)) database.createObjectStore(ITEMS, { keyPath: "catalog_item_id" });
      if (!database.objectStoreNames.contains(META)) database.createObjectStore(META, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readOfflineCatalog() {
  const database = await openDatabase();
  const transaction = database.transaction([ITEMS, META], "readonly");
  const items = await requestValue(transaction.objectStore(ITEMS).getAll() as IDBRequest<CatalogOfflineItem[]>);
  const meta = await requestValue(transaction.objectStore(META).get("catalog") as IDBRequest<CatalogMeta | undefined>);
  database.close();
  return { items, meta };
}

export async function saveOfflineCatalog(version: string, items: CatalogOfflineItem[]) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([ITEMS, META], "readwrite");
    const store = transaction.objectStore(ITEMS);
    store.clear();
    for (const item of items) store.put(item);
    transaction.objectStore(META).put({ key: "catalog", version, syncedAt: new Date().toISOString() } satisfies CatalogMeta);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

export function queryOfflineCatalog(items: CatalogOfflineItem[], { query = "", line = "Todas", category = "Todos", offset = 0, limit = 40 }: { query?: string; line?: string; category?: string; offset?: number; limit?: number }) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim().replace(/\s+/g, " ");
  const needle = normalize(query);
  const selection = items.filter((item) => line === "Todas" || item.lines.includes(line));
  const filtered = selection.filter((item) => {
    if (category !== "Todos" && item.category !== category) return false;
    if (!needle) return true;
    const haystack = normalize([item.code, item.name, item.line, item.lines.join(" "), item.category, item.typology, item.color].filter(Boolean).join(" "));
    return haystack.includes(needle) || haystack.replace(/[^a-z0-9]/g, "").includes(needle.replace(/[^a-z0-9]/g, ""));
  });
  return { items: filtered.slice(offset, offset + limit), total: filtered.length, selectionTotal: selection.length, hasMore: offset + limit < filtered.length, nextOffset: offset + limit };
}
