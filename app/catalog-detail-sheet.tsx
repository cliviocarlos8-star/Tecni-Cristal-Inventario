"use client";

import { useEffect, useState } from "react";
import type { CatalogDetailItem, CatalogListItem, CatalogOfflineItem } from "./catalog-data";
import { TcIcon } from "./icons";

export default function CatalogDetailSheet({ item, localItem, onClose }: { item: CatalogListItem; localItem?: CatalogOfflineItem; onClose: () => void }) {
  const [detail, setDetail] = useState<CatalogDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const fallbackImage = item.list_image_url || item.thumbnail_url;
  const [image, setImage] = useState(fallbackImage);

  useEffect(() => {
    const controller = new AbortController();
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeWithEscape);
    document.body.classList.add("catalog-detail-open");
    fetch(`/api/catalog-detail?id=${encodeURIComponent(item.catalog_item_id)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<CatalogDetailItem> : Promise.reject())
      .then(setDetail)
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => {
      controller.abort();
      document.removeEventListener("keydown", closeWithEscape);
      document.body.classList.remove("catalog-detail-open");
    };
  }, [item.catalog_item_id, onClose]);

  useEffect(() => {
    if (!detail?.image_url || detail.image_url === fallbackImage) return;
    let active = true;
    const highResolutionImage = new Image();
    highResolutionImage.onload = () => { if (active) setImage(detail.image_url); };
    highResolutionImage.src = detail.image_url;
    return () => { active = false; };
  }, [detail?.image_url, fallbackImage]);

  const shown = detail || localItem;

  return <div className="catalog-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="catalog-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="catalog-detail-title">
      <header><div><span>Ficha técnica</span><small>Imagen completa</small></div><button type="button" onClick={onClose} aria-label="Cerrar ficha"><TcIcon name="close" /></button></header>
      <div className="catalog-detail-photo"><img src={image} alt={item.name} width="900" height="720" decoding="async" /></div>
      <div className="catalog-detail-body">
        <b className="catalog-detail-code">{item.code}</b>
        <h3 id="catalog-detail-title">{item.name}</h3>
        <p>{item.typology || "Artículo del catálogo técnico"}</p>
        <dl>
          <div><dt>Línea</dt><dd>{item.line}</dd></div>
          <div><dt>Categoría</dt><dd>{item.category}</dd></div>
          <div><dt>Familia</dt><dd>{item.typology || "Sin especificar"}</dd></div>
          <div><dt>Peso / medida</dt><dd>{item.weight || "Sin especificar"}</dd></div>
          <div><dt>Color / terminación</dt><dd>{shown?.color || (loading ? "Cargando…" : "No especificado")}</dd></div>
        </dl>
        {!detail && !loading && <small className="catalog-detail-offline">Mostrando la información disponible sin conexión.</small>}
      </div>
    </aside>
  </div>;
}
