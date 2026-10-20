"use client";
import { ContextualHint, IntroductionLink } from "./onboarding/provider";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogListItem, CatalogOfflineItem } from "./catalog-data";
import { queryOfflineCatalog, readOfflineCatalog, saveOfflineCatalog } from "./catalog-offline";
import CatalogDetailSheet from "./catalog-detail-sheet";
import { TcIcon } from "./icons";

type CatalogPage = { items: CatalogListItem[]; total: number; selectionTotal: number; hasMore: boolean; nextOffset: number };
type SyncState = "checking" | "syncing" | "ready" | "offline" | "unavailable";
const PAGE_SIZE = 40;

export default function TechnicalCatalog({ initialPage, lines, categories, catalogTotal }: { initialPage: CatalogPage; lines: string[]; categories: string[]; catalogTotal: number }) {
  const [line, setLine] = useState("Todas");
  const [category, setCategory] = useState("Todos");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [online, setOnline] = useState(true);
  const [dataMode, setDataMode] = useState<"server" | "local">("server");
  const [syncState, setSyncState] = useState<SyncState>("checking");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [linesOpen, setLinesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogListItem | null>(null);
  const offlineItems = useRef<CatalogOfflineItem[]>([]);
  const firstQuery = useRef(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const cacheThumbnails = useCallback((items: CatalogOfflineItem[]) => {
    if (!("serviceWorker" in navigator)) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || connection?.effectiveType === "slow-2g") return;
    navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: "CACHE_CATALOG_THUMBNAILS", urls: [...new Set(items.map((item) => item.thumbnail_url))] })).catch(() => undefined);
  }, []);

  const synchronize = useCallback(async () => {
    let local: Awaited<ReturnType<typeof readOfflineCatalog>> | null = null;
    try {
      local = await readOfflineCatalog();
      offlineItems.current = local.items;
    } catch {
      local = null;
    }

    if (!navigator.onLine) {
      setOnline(false);
      setSyncState(local?.items.length ? "offline" : "unavailable");
      if (local?.items.length) {
        setPage(queryOfflineCatalog(local.items, {}));
        setDataMode("local");
      }
      return;
    }

    setOnline(true);
    setSyncState("checking");
    try {
      const metaResponse = await fetch("/api/catalog-meta", { cache: "no-store" });
      if (!metaResponse.ok) throw new Error("No se pudo verificar el catálogo");
      const meta = await metaResponse.json() as { version: string; total: number };
      if (local?.meta?.version === meta.version && local.items.length === meta.total) {
        setSyncState("ready");
        cacheThumbnails(local.items);
        return;
      }

      setSyncState("syncing");
      const snapshotResponse = await fetch("/api/catalog-snapshot", { cache: "no-store" });
      if (!snapshotResponse.ok) throw new Error("No se pudo sincronizar el catálogo");
      const snapshot = await snapshotResponse.json() as { version: string; items: CatalogOfflineItem[] };
      await saveOfflineCatalog(snapshot.version, snapshot.items);
      offlineItems.current = snapshot.items;
      setSyncState("ready");
      cacheThumbnails(snapshot.items);
    } catch {
      setSyncState(local?.items.length ? "offline" : "unavailable");
    }
  }, [cacheThumbnails]);

  useEffect(() => {
    synchronize();
    const wentOnline = () => { setOnline(true); synchronize(); };
    const wentOffline = () => { setOnline(false); setSyncState(offlineItems.current.length ? "offline" : "unavailable"); };
    window.addEventListener("online", wentOnline);
    window.addEventListener("offline", wentOffline);
    return () => { window.removeEventListener("online", wentOnline); window.removeEventListener("offline", wentOffline); };
  }, [synchronize]);

  const requestPage = useCallback(async (offset: number): Promise<{ result: CatalogPage; mode: "server" | "local" }> => {
    if (navigator.onLine) {
      try {
        const params = new URLSearchParams({ q: debouncedQuery, line, category, offset: String(offset), limit: String(PAGE_SIZE) });
        const response = await fetch(`/api/catalog?${params}`);
        if (!response.ok) throw new Error("Consulta no disponible");
        return { result: await response.json() as CatalogPage, mode: "server" };
      } catch {}
    }
    let items = offlineItems.current;
    if (!items.length) {
      try { items = (await readOfflineCatalog()).items; offlineItems.current = items; } catch { items = []; }
    }
    if (!items.length) throw new Error("No existe una copia local del catálogo");
    return { result: queryOfflineCatalog(items, { query: debouncedQuery, line, category, offset, limit: PAGE_SIZE }), mode: "local" };
  }, [debouncedQuery, line, category]);

  useEffect(() => {
    if (firstQuery.current) { firstQuery.current = false; return; }
    let active = true;
    setLoading(true);
    requestPage(0).then(({ result, mode }) => {
      if (!active) return;
      setPage(result);
      setDataMode(mode);
    }).catch(() => {
      if (active) setPage({ items: [], total: 0, selectionTotal: 0, hasMore: false, nextOffset: 0 });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestPage]);

  async function loadMore() {
    if (!page.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const { result, mode } = await requestPage(page.nextOffset);
      setDataMode(mode);
      setPage((current) => ({ ...result, items: [...current.items, ...result.items.filter((item) => !current.items.some((existing) => existing.catalog_item_id === item.catalog_item_id))] }));
    } finally { setLoadingMore(false); }
  }

  const activeFilterCount = Number(line !== "Todas") + Number(category !== "Todos");
  const syncLabel = syncState === "syncing" ? "Guardando catálogo offline…" : syncState === "ready" ? "Disponible offline" : syncState === "offline" ? "Usando copia local" : syncState === "unavailable" ? "Sin copia local" : "Verificando catálogo…";
  const closeDetail = useCallback(() => setSelectedItem(null), []);

  return <main className="technical-catalog-shell">
    <aside className="technical-catalog-sidebar">
      <div className="technical-catalog-switcher">
        <button className="technical-catalog-brand" type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><img src="/brand/tecni-cristal-logo.jpg" alt="Tecni Cristal" width="44" height="44" /><span><strong>Tecni Cristal</strong><small>Catálogo técnico</small></span><i>{menuOpen ? "×" : "☰"}</i></button>
        <div className={`technical-catalog-app-menu${menuOpen ? " open" : ""}`}><span>CAMBIAR SECCIÓN</span><a className="current" href="/catalogo-tecnico"><b>Catálogo técnico</b><small>Perfiles y componentes</small></a><a href="/"><b>Control de inventario</b><small>Productos, obras y depósitos</small></a></div>
      </div>
      <p>LÍNEAS</p><button className={line === "Todas" ? "active" : ""} onClick={() => setLine("Todas")}>Todas las líneas</button>
      {lines.map((name) => <button className={line === name ? "active" : ""} onClick={() => setLine(name)} key={name}>{name}</button>)}
    </aside>
    <section className="technical-catalog-content">
<IntroductionLink />
<ContextualHint id="catalog"/>
      <header><div><label>BASE DE DATOS TÉCNICA</label><h1>Catálogo técnico</h1><p>Perfiles, herrajes y componentes de Tecni Cristal.</p></div><span>{line === "Todas" ? `${catalogTotal} artículos` : `Línea ${line}`}</span></header>
      <div className="technical-catalog-sync" data-mode={dataMode === "local" || !online ? "offline" : "online"}><i /><span>{syncLabel}</span></div>
      <div className="technical-catalog-stats"><article><span>Artículos disponibles</span><b>{page.selectionTotal}</b><small>en la selección actual</small></article><article><span>Resultados</span><b>{page.total}</b><small>según búsqueda y filtros</small></article><article><span>Líneas técnicas</span><b>{lines.length}</b><small>integradas al inventario</small></article></div>
      <div className="technical-catalog-controls"><div className="technical-catalog-tools">
        <label className="technical-catalog-search"><TcIcon name="search" size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar código o nombre…" autoComplete="off" enterKeyHint="search" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda">×</button>}</label>
        <button className="technical-catalog-lines-trigger" type="button" onClick={() => { setFiltersOpen(false); setLinesOpen(true); }}><TcIcon name="menu" size={18} />Líneas{line !== "Todas" && <b>1</b>}</button>
        <button className="technical-catalog-filter-trigger" type="button" onClick={() => { setLinesOpen(false); setFiltersOpen(true); }}><TcIcon name="filter" size={18} />Filtros{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
      </div>
      <div className={`technical-catalog-filter-panel${filtersOpen ? " open" : ""}`}>
        <div className="technical-catalog-filter-heading"><strong>Filtros</strong><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros">×</button></div>
        <label><span>Línea</span><select value={line} onChange={(event) => setLine(event.target.value)} aria-label="Filtrar por línea"><option value="Todas">Todas las líneas</option>{lines.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label><span>Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar por categoría"><option>Todos</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></label>
        <button className="technical-catalog-filter-apply" type="button" onClick={() => setFiltersOpen(false)}>Ver {page.total} resultados</button>
      </div></div>
      <div className={`technical-catalog-lines-panel${linesOpen ? " open" : ""}`}>
        <div className="technical-catalog-filter-heading"><div><small>ACCESO RÁPIDO</small><strong>Líneas</strong></div><button type="button" onClick={() => setLinesOpen(false)} aria-label="Cerrar líneas">×</button></div>
        <div className="technical-catalog-line-grid"><button type="button" className={line === "Todas" ? "active" : ""} onClick={() => { setLine("Todas"); setLinesOpen(false); }}>Todas las líneas</button>{lines.map((name) => <button type="button" className={line === name ? "active" : ""} key={name} onClick={() => { setLine(name); setLinesOpen(false); }}>{name}</button>)}</div>
      </div>
      {filtersOpen && <button className="technical-catalog-filter-backdrop" type="button" aria-label="Cerrar filtros" onClick={() => setFiltersOpen(false)} />}
      {linesOpen && <button className="technical-catalog-filter-backdrop" type="button" aria-label="Cerrar líneas" onClick={() => setLinesOpen(false)} />}
      <div className="technical-catalog-mobile-summary"><strong>{page.total} resultados</strong><span>{page.items.length} visibles</span></div>
      <div className={`technical-catalog-table-card${loading ? " is-loading" : ""}`} aria-busy={loading}>
        <div className="technical-catalog-table-head"><strong>Artículos registrados</strong><small>{page.total} resultados · {page.items.length} visibles</small></div>
        <div className="table-scroll"><table><thead><tr><th>Imagen</th><th>Código</th><th>Nombre</th><th>Línea</th><th>Categoría</th><th>Peso</th></tr></thead><tbody>{page.items.map((item) => <tr key={item.catalog_item_id} className="catalog-open-row" tabIndex={0} aria-label={`Abrir ficha de ${item.code}, ${item.name}`} onClick={() => setSelectedItem(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedItem(item); } }}><td className="catalog-image"><img src={item.list_image_url} srcSet={`${item.thumbnail_url} 116w, ${item.list_image_url} 320w`} sizes="(max-width: 380px) 100px, (max-width: 820px) 112px, 72px" alt="" width="320" height="256" loading="lazy" decoding="async" onError={(event) => { const image = event.currentTarget; if (image.dataset.fallback === "1") return; image.dataset.fallback = "1"; image.srcset = ""; image.src = item.thumbnail_url; }} /></td><td className="catalog-code"><b className="sku">{item.code}</b></td><td className="catalog-name"><strong>{item.name}</strong><small>{item.typology || "Sin familia"}</small></td><td className="catalog-line">{item.line}</td><td className="catalog-category">{item.category}</td><td className="catalog-weight">{item.weight || "—"}</td></tr>)}</tbody></table></div>
        {!loading && !page.items.length && <div className="catalog-empty"><strong>Sin resultados</strong><span>{syncState === "unavailable" ? "Conéctate una vez para guardar el catálogo en el teléfono." : "Probá con otro código, nombre o filtro."}</span></div>}
        {page.hasMore && <div className="technical-catalog-more"><button type="button" onClick={loadMore} disabled={loadingMore || loading}>{loadingMore ? "Cargando…" : "Cargar 40 más"}</button><small>Mostrando {page.items.length} de {page.total}</small></div>}
      </div>
    </section>
    {selectedItem && <CatalogDetailSheet item={selectedItem} localItem={offlineItems.current.find((candidate) => candidate.catalog_item_id === selectedItem.catalog_item_id)} onClose={closeDetail} />}
  </main>;
}
