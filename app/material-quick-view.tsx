"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { TcIcon } from "./icons";
import catalogIndex from "./catalog-index.json";

export type MaterialRef = { id?: string; sku: string; name: string };
type MaterialDetail = MaterialRef & { description:string|null; color:string|null; dimensions:string|null; active:boolean; category:{name:string}|null; unit:{code:string;name:string}|null };
type CatalogPreview = { code:string; name:string; line:string; category:string; weight?:string|null; color?:string|null; thumbnail_url:string; catalog_url:string };

export function MaterialLink({ material, onOpen }: { material:MaterialRef; onOpen:(material:MaterialRef)=>void }) {
  return <button type="button" className="material-reference" onClick={event=>{event.stopPropagation();onOpen(material);}} title="Ver identificación técnica"><span><b>{material.sku}</b> · {material.name}</span><TcIcon name="view" size={14}/></button>;
}

export function MaterialQuickView({ material, onClose }: { material:MaterialRef|null; onClose:()=>void }) {
  const [detail,setDetail]=useState<MaterialDetail|null>(null),[loading,setLoading]=useState(false),[unavailable,setUnavailable]=useState(false);
  useEffect(()=>{if(!material)return;let alive=true;const timer=window.setTimeout(()=>{setLoading(true);setUnavailable(false);setDetail(null);const query=supabase.from("products").select("id,sku,name,description,color,dimensions,active,category:categories(name),unit:units(code,name)");(material.id?query.eq("id",material.id):query.eq("sku",material.sku)).maybeSingle().then(result=>{if(!alive)return;if(result.error||!result.data)setUnavailable(true);else setDetail(result.data as unknown as MaterialDetail);setLoading(false);});},0);return()=>{alive=false;window.clearTimeout(timer);};},[material]);
  useEffect(()=>{if(!material)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[material,onClose]);
  if(!material)return null; const shown=detail||material; const catalog=(catalogIndex as CatalogPreview[]).find(item=>item.code===material.sku.toUpperCase());
  return <div className="material-drawer-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside className="material-drawer" role="dialog" aria-modal="true" aria-label={`Detalle de ${material.name}`}><header><div><p className="eyebrow">Vista rápida del material</p><h3>{shown.sku} · {shown.name}</h3></div><button type="button" onClick={onClose} aria-label="Cerrar"><TcIcon name="close"/></button></header>{loading?<div className="material-drawer-loading"><div className="spinner"/>Cargando ficha esencial…</div>:unavailable?<div className="material-unavailable"><TcIcon name="products" size={28}/><strong>Ficha temporalmente no disponible</strong><span>El inventario sigue funcionando y el código histórico se conserva.</span></div>:detail&&<><div className="material-photo-placeholder">{catalog?<img src={catalog.thumbnail_url} alt={catalog.name} loading="lazy"/>:<><TcIcon name="products" size={34}/><span>Material sin imagen de catálogo</span></>}</div><dl className="material-facts"><div><dt>Código</dt><dd>{detail.sku}</dd></div><div><dt>Nombre</dt><dd>{detail.name}</dd></div><div><dt>Línea</dt><dd>{catalog?.line||detail.description||"Sin línea vinculada"}</dd></div><div><dt>Categoría</dt><dd>{catalog?.category||detail.category?.name||"Sin categoría"}</dd></div><div><dt>Medida</dt><dd>{catalog?.weight||detail.dimensions||"Sin medida registrada"}</dd></div><div><dt>Color / terminación</dt><dd>{catalog?.color||detail.color||"No especificado"}</dd></div><div><dt>Unidad</dt><dd>{detail.unit?`${detail.unit.code} · ${detail.unit.name}`:"Sin unidad"}</dd></div></dl>{!detail.active&&<p className="material-archived">Material archivado · el historial permanece disponible.</p>}{catalog&&<a className="material-full-link" href={catalog.catalog_url} target="_blank" rel="noreferrer">Ver ficha técnica completa <span>→</span></a>}</>}</aside></div>;
}
