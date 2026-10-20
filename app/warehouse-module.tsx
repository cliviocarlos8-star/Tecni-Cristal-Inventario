"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { TcIcon } from "./icons";

type Role = "ADMIN" | "GERENCIA" | "DEPOSITO" | "CONSULTA";
type Warehouse = { id:string; code:string; name:string; address:string|null; notes:string|null; active:boolean };
type Location = { id:string; warehouse_id:string; code:string; name:string; zone:string|null; aisle:string|null; shelf:string|null; position:string|null; notes:string|null; active:boolean; warehouse:{name:string;code:string}|null };
type Panel = "warehouses" | "locations";
type Modal = { kind:Panel; id?:string } | null;

const emptyWarehouse={code:"",name:"",address:"",notes:"",active:true};
const emptyLocation={warehouse_id:"",code:"",name:"",zone:"",aisle:"",shelf:"",position:"",notes:"",active:true};

export default function WarehouseModule({role}:{role:Role}){
  const[panel,setPanel]=useState<Panel>("warehouses");
  const[warehouses,setWarehouses]=useState<Warehouse[]>([]);
  const[locations,setLocations]=useState<Location[]>([]);
  const[warehouseFilter,setWarehouseFilter]=useState("all");
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[message,setMessage]=useState("");
  const[error,setError]=useState("");
  const[modal,setModal]=useState<Modal>(null);
  const[warehouseForm,setWarehouseForm]=useState(emptyWarehouse);
  const[locationForm,setLocationForm]=useState(emptyLocation);
  const canManage=role==="ADMIN"||role==="GERENCIA";

  async function loadData(){
    setLoading(true);setError("");
    const[warehouseResult,locationResult]=await Promise.all([
      supabase.from("warehouses").select("id,code,name,address,notes,active").order("name"),
      supabase.from("warehouse_locations").select("id,warehouse_id,code,name,zone,aisle,shelf,position,notes,active,warehouse:warehouses(name,code)").order("code")
    ]);
    const problem=warehouseResult.error||locationResult.error;
    if(problem)setError("No se pudieron cargar los depósitos. Intenta actualizar la página.");
    else{setWarehouses((warehouseResult.data||[]) as Warehouse[]);setLocations((locationResult.data||[]) as unknown as Location[]);}
    setLoading(false);
  }

  useEffect(()=>{const timer=window.setTimeout(()=>{void loadData();},0);return()=>window.clearTimeout(timer);},[]);

  const filteredLocations=useMemo(()=>warehouseFilter==="all"?locations:locations.filter(item=>item.warehouse_id===warehouseFilter),[locations,warehouseFilter]);

  function openCreate(kind:Panel){
    setMessage("");setError("");setModal({kind});
    if(kind==="warehouses")setWarehouseForm(emptyWarehouse);
    else setLocationForm({...emptyLocation,warehouse_id:warehouses.find(item=>item.active)?.id||""});
  }

  function openEdit(kind:Panel,id:string){
    setMessage("");setError("");setModal({kind,id});
    if(kind==="warehouses"){
      const item=warehouses.find(row=>row.id===id);if(item)setWarehouseForm({code:item.code,name:item.name,address:item.address||"",notes:item.notes||"",active:item.active});
    }else{
      const item=locations.find(row=>row.id===id);if(item)setLocationForm({warehouse_id:item.warehouse_id,code:item.code,name:item.name,zone:item.zone||"",aisle:item.aisle||"",shelf:item.shelf||"",position:item.position||"",notes:item.notes||"",active:item.active});
    }
  }

  function friendlyError(code?:string){return code==="23505"?"Ese código o nombre ya está registrado.":code==="23503"?"Selecciona un depósito válido.":"No se pudo guardar. Revisa los datos e intenta nuevamente.";}

  async function saveWarehouse(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    const payload={code:warehouseForm.code.trim().toUpperCase(),name:warehouseForm.name.trim(),address:warehouseForm.address.trim()||null,notes:warehouseForm.notes.trim()||null,active:warehouseForm.active};
    const result=modal?.id?await supabase.from("warehouses").update(payload).eq("id",modal.id):await supabase.from("warehouses").insert(payload);
    if(result.error)setError(friendlyError(result.error.code));else{setModal(null);setMessage(modal?.id?"Depósito actualizado.":"Depósito creado correctamente.");await loadData();}setSaving(false);
  }

  async function saveLocation(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    const payload={warehouse_id:locationForm.warehouse_id,code:locationForm.code.trim().toUpperCase(),name:locationForm.name.trim(),zone:locationForm.zone.trim()||null,aisle:locationForm.aisle.trim()||null,shelf:locationForm.shelf.trim()||null,position:locationForm.position.trim()||null,notes:locationForm.notes.trim()||null,active:locationForm.active};
    const result=modal?.id?await supabase.from("warehouse_locations").update(payload).eq("id",modal.id):await supabase.from("warehouse_locations").insert(payload);
    if(result.error)setError(friendlyError(result.error.code));else{setModal(null);setMessage(modal?.id?"Ubicación actualizada.":"Ubicación creada correctamente.");await loadData();}setSaving(false);
  }

  return <section className="catalog-workspace">
    <div className="catalog-heading"><div><p className="eyebrow">Fase 2 · Catálogos maestros</p><h2>Depósitos y ubicaciones</h2><p>Organiza dónde se guardará físicamente cada material de Tecni Cristal.</p></div>{canManage&&<button className="primary-action" onClick={()=>openCreate(panel)}><TcIcon name="plus" size={16}/>{panel==="warehouses"?"Nuevo depósito":"Nueva ubicación"}</button>}</div>
    <div className="catalog-stats"><article><span>Depósitos</span><b>{warehouses.length}</b><small>{warehouses.filter(x=>x.active).length} activos</small></article><article><span>Ubicaciones</span><b>{locations.length}</b><small>posiciones registradas</small></article><article><span>Sin ubicación</span><b>{warehouses.filter(item=>!locations.some(location=>location.warehouse_id===item.id)).length}</b><small>depósitos por organizar</small></article></div>
    <div className="catalog-tabs" role="tablist"><button className={panel==="warehouses"?"active":""} onClick={()=>setPanel("warehouses")}>Depósitos</button><button className={panel==="locations"?"active":""} onClick={()=>setPanel("locations")}>Ubicaciones</button></div>
    {message&&<p className="success-banner">✓ {message}</p>}{error&&!modal&&<p className="error-banner">{error}</p>}
    {loading?<div className="catalog-loading"><div className="spinner"/><span>Cargando depósitos…</span></div>:<>
      {panel==="warehouses"&&<div className="catalog-card"><div className="table-scroll"><table className="data-table"><thead><tr><th>Código</th><th>Depósito</th><th>Dirección</th><th>Ubicaciones</th><th>Estado</th><th/></tr></thead><tbody>{warehouses.map(item=><tr key={item.id}><td><b className="sku">{item.code}</b></td><td><strong>{item.name}</strong><small>{item.notes||"Sin observaciones"}</small></td><td>{item.address||"Pendiente"}</td><td>{locations.filter(location=>location.warehouse_id===item.id).length}</td><td><Status active={item.active}/></td><td>{canManage&&<button className="row-action" onClick={()=>openEdit("warehouses",item.id)}>Editar</button>}</td></tr>)}</tbody></table></div>{!warehouses.length&&<Empty text="Crea el primer depósito para comenzar."/>}</div>}
      {panel==="locations"&&<div className="catalog-card"><div className="catalog-toolbar"><select value={warehouseFilter} onChange={event=>setWarehouseFilter(event.target.value)}><option value="all">Todos los depósitos</option>{warehouses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><span>{filteredLocations.length} ubicaciones</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Código</th><th>Ubicación</th><th>Depósito</th><th>Referencia física</th><th>Estado</th><th/></tr></thead><tbody>{filteredLocations.map(item=><tr key={item.id}><td><b className="sku">{item.code}</b></td><td><strong>{item.name}</strong><small>{item.notes||"Sin observaciones"}</small></td><td>{item.warehouse?.name||"—"}</td><td>{[item.zone&&`Zona ${item.zone}`,item.aisle&&`Pasillo ${item.aisle}`,item.shelf&&`Estante ${item.shelf}`,item.position&&`Posición ${item.position}`].filter(Boolean).join(" · ")||"Pendiente"}</td><td><Status active={item.active}/></td><td>{canManage&&<button className="row-action" onClick={()=>openEdit("locations",item.id)}>Editar</button>}</td></tr>)}</tbody></table></div>{!filteredLocations.length&&<Empty text="Crea una ubicación para indicar zona, pasillo, estante o posición."/>}</div>}
    </>}
    {modal?.kind==="warehouses"&&<ModalShell title={modal.id?"Editar depósito":"Nuevo depósito"} onClose={()=>setModal(null)} error={error}><form className="catalog-form" onSubmit={saveWarehouse}><div className="form-grid"><label>Código<input value={warehouseForm.code} maxLength={30} onChange={event=>setWarehouseForm({...warehouseForm,code:event.target.value.toUpperCase()})} placeholder="Ej. DEP-PRINCIPAL" required/></label><label>Nombre<input value={warehouseForm.name} onChange={event=>setWarehouseForm({...warehouseForm,name:event.target.value})} required/></label><label className="wide">Dirección<input value={warehouseForm.address} onChange={event=>setWarehouseForm({...warehouseForm,address:event.target.value})}/></label><label className="wide">Observaciones<textarea value={warehouseForm.notes} onChange={event=>setWarehouseForm({...warehouseForm,notes:event.target.value})}/></label></div><label className="check"><input type="checkbox" checked={warehouseForm.active} onChange={event=>setWarehouseForm({...warehouseForm,active:event.target.checked})}/> Depósito activo</label><FormActions saving={saving} onCancel={()=>setModal(null)}/></form></ModalShell>}
    {modal?.kind==="locations"&&<ModalShell title={modal.id?"Editar ubicación":"Nueva ubicación"} onClose={()=>setModal(null)} error={error}><form className="catalog-form" onSubmit={saveLocation}><div className="form-grid"><label>Depósito<select value={locationForm.warehouse_id} onChange={event=>setLocationForm({...locationForm,warehouse_id:event.target.value})} required><option value="">Seleccionar…</option>{warehouses.filter(item=>item.active||item.id===locationForm.warehouse_id).map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label>Código<input value={locationForm.code} maxLength={30} onChange={event=>setLocationForm({...locationForm,code:event.target.value.toUpperCase()})} placeholder="Ej. Z1-E01" required/></label><label>Nombre<input value={locationForm.name} onChange={event=>setLocationForm({...locationForm,name:event.target.value})} placeholder="Ej. Estante de perfiles" required/></label><label>Zona<input value={locationForm.zone} onChange={event=>setLocationForm({...locationForm,zone:event.target.value})}/></label><label>Pasillo<input value={locationForm.aisle} onChange={event=>setLocationForm({...locationForm,aisle:event.target.value})}/></label><label>Estante<input value={locationForm.shelf} onChange={event=>setLocationForm({...locationForm,shelf:event.target.value})}/></label><label>Posición<input value={locationForm.position} onChange={event=>setLocationForm({...locationForm,position:event.target.value})}/></label><label className="wide">Observaciones<textarea value={locationForm.notes} onChange={event=>setLocationForm({...locationForm,notes:event.target.value})}/></label></div><label className="check"><input type="checkbox" checked={locationForm.active} onChange={event=>setLocationForm({...locationForm,active:event.target.checked})}/> Ubicación activa</label><FormActions saving={saving} onCancel={()=>setModal(null)}/></form></ModalShell>}
  </section>;
}

function Status({active}:{active:boolean}){return <span className={active?"status active":"status"}>{active?"Activo":"Inactivo"}</span>;}
function Empty({text}:{text:string}){return <div className="catalog-empty"><strong>Sin registros</strong><span>{text}</span></div>;}
function ModalShell({title,onClose,error,children}:{title:string;onClose:()=>void;error:string;children:React.ReactNode}){return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="catalog-modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-title"><div><p className="eyebrow">Catálogo maestro</p><h3>{title}</h3></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></div>{error&&<p className="error-banner">{error}</p>}{children}</section></div>;}
function FormActions({saving,onCancel}:{saving:boolean;onCancel:()=>void}){return <div className="form-actions"><button type="button" onClick={onCancel}>Cancelar</button><button className="primary-action" type="submit" disabled={saving}>{saving?"Guardando…":"Guardar"}</button></div>;}
