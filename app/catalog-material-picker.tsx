"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import catalogIndex from "./catalog-index.json";

export type CatalogItem = { catalog_item_id:string; code:string; name:string; line:string; lines:string[]; category:string; color:string; weight:string|null; typology:string|null; thumbnail_url:string; catalog_url:string; active:boolean };
type ProductOption={id:string;sku:string;name:string;unit:{code:string}|null};
export const activeCatalog=(catalogIndex as CatalogItem[]).filter(item=>item.active);
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

export function getCatalogItem(value:string){
  if(!value.startsWith("catalog:")) return null;
  return activeCatalog.find(item=>item.catalog_item_id===value)||activeCatalog.find(item=>item.code===value.slice(8).toUpperCase())||null;
}

export default function CatalogMaterialPicker({value,onChange,products}:{value:string;onChange:(value:string)=>void;products:ProductOption[]}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[expandedLine,setExpandedLine]=useState<string|null>(null);
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null);
  const productById=useMemo(()=>new Map(products.map(item=>[item.id,item])),[products]);
  const operationalByCode=useMemo(()=>new Map(products.map(item=>[item.sku.toUpperCase(),item])),[products]);
  const selected=value.startsWith("catalog:")?getCatalogItem(value):productById.get(value);
  const grouped=useMemo(()=>{const groups=new Map<string,CatalogItem[]>();activeCatalog.forEach(item=>(item.lines?.length?item.lines:[item.line]).forEach(line=>groups.set(line,[...(groups.get(line)||[]),item])));return [...groups.entries()].map(([name,items])=>({name,items:items.sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}))})).sort((a,b)=>a.name.localeCompare(b.name))},[]);
  const globalResults=useMemo(()=>{const term=normalize(query);if(!term)return [];return activeCatalog.filter(item=>normalize(`${item.code} ${item.name} ${item.line} ${(item.lines||[]).join(" ")} ${item.category} ${item.typology||""}`).includes(term)).sort((a,b)=>{const ca=normalize(a.code),cb=normalize(b.code),rank=(code:string)=>code===term?0:code.startsWith(term)?1:2;return rank(ca)-rank(cb)||a.code.localeCompare(b.code,undefined,{numeric:true})})},[query]);
  const visibleInLine=useMemo(()=>{if(!expandedLine)return [];const items=grouped.find(group=>group.name===expandedLine)?.items||[],term=normalize(query);return term?items.filter(item=>normalize(`${item.code} ${item.name} ${item.category} ${item.typology||""}`).includes(term)):items},[expandedLine,grouped,query]);
  useEffect(()=>{const close=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close)},[]);
  useEffect(()=>{if(!open)return;const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus()}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[open]);
  const choose=(item:CatalogItem)=>{const operational=operationalByCode.get(item.code.toUpperCase());onChange(operational?.id||item.catalog_item_id);setOpen(false);setQuery("");setExpandedLine(null);requestAnimationFrame(()=>trigger.current?.focus())};
  const renderItem=(item:CatalogItem)=>{const operational=operationalByCode.get(item.code.toUpperCase());return <button type="button" className="catalog-material-row" key={`${expandedLine||"search"}:${item.catalog_item_id}`} onClick={()=>choose(item)}><span><strong>{item.code} · {item.name}</strong><small>{(item.lines?.length?item.lines.join(" / "):item.line)} · {item.category}</small></span><em className={operational?"operational":"catalog-only"}>{operational?"En inventario":"Catálogo · Stock 0"}</em></button>};
  return <div className="catalog-material-picker" ref={root}>
    <button ref={trigger} type="button" className="catalog-picker-trigger" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-haspopup="dialog">{selected?<span><b>{"sku" in selected?selected.sku:selected.code}</b><small>{selected.name}</small></span>:<span className="catalog-picker-placeholder">Elegir línea o buscar material…</span>}<i aria-hidden="true">⌄</i></button>
    {open&&<div className="catalog-picker-popover" role="dialog" aria-label="Selector de materiales por líneas">
      <div className="catalog-picker-head"><div><strong>Seleccionar material</strong><small>{expandedLine||`${grouped.length} líneas · ${activeCatalog.length.toLocaleString("es-PY")} materiales`}</small></div><button type="button" onClick={()=>{setOpen(false);trigger.current?.focus()}} aria-label="Cerrar selector">×</button></div>
      <input ref={search} autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder={expandedLine?`Buscar dentro de ${expandedLine}…`:"Buscar código, nombre, línea o categoría…"}/>
      {expandedLine&&<button type="button" className="catalog-all-lines" onClick={()=>{setExpandedLine(null);setQuery("")}}>← Todas las líneas</button>}
      <div className="catalog-picker-results">{query.trim()&&!expandedLine?<>{globalResults.map(renderItem)}{!globalResults.length&&<p>No hay materiales con esa búsqueda.</p>}</>:expandedLine?<>{visibleInLine.map(renderItem)}{!visibleInLine.length&&<p>No hay materiales con esa búsqueda dentro de {expandedLine}.</p>}</>:<div className="catalog-line-list">{grouped.map(group=><button type="button" className="catalog-line-row" key={group.name} onClick={()=>{setExpandedLine(group.name);setQuery("");requestAnimationFrame(()=>search.current?.focus())}} aria-expanded={false}><span><strong>{group.name}</strong><small>{group.items.length} {group.items.length===1?"material":"materiales"}</small></span><i aria-hidden="true">⌄</i></button>)}</div>}</div>
    </div>}
  </div>;
}
