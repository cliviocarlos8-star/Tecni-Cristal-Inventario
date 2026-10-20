"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import CatalogMaterialPicker, { getCatalogItem } from "./catalog-material-picker";
import { catalogDescription, catalogProductType, catalogUnit } from "./catalog-inventory";
import { formatInventoryQuantity } from "./inventory-format";
import { openMovementDetail } from "./movement-detail";
import { TcIcon } from "./icons";

type Role = "ADMIN" | "GERENCIA" | "DEPOSITO" | "CONSULTA";
type Product = { id:string; sku:string; name:string; min_stock:number; unit:{code:string;allows_decimals?:boolean|null}|null };
type Location = { id:string; name:string; code:string; location_type:"WORKSHOP"|"PROJECT"; work_id:string|null };
type Responsible = { id:string; full_name:string };
type Balance = { product_id:string; location_id:string; quantity:number };
type CategoryOption = { id:string; name:string };
type UnitOption = { id:string; code:string };

export default function QuickInventoryAction({role,workId,defaultKind="OUT",triggerLabel="Acción rápida",triggerClassName="quick-action-trigger"}:{role:Role;workId:string|null;defaultKind?:"OUT"|"IN";triggerLabel?:string;triggerClassName?:string}) {
  const [open,setOpen]=useState(false),[kind,setKind]=useState<"OUT"|"IN">(defaultKind),[products,setProducts]=useState<Product[]>([]),[locations,setLocations]=useState<Location[]>([]),[responsibles,setResponsibles]=useState<Responsible[]>([]),[balances,setBalances]=useState<Balance[]>([]);
  const [material,setMaterial]=useState(""),[quantity,setQuantity]=useState("1"),[locationId,setLocationId]=useState(""),[responsible,setResponsible]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState<{id:string;code:string}|null>(null);
  const requestCode=useRef("");
  const canPost=role!=="CONSULTA";

  async function load(){
    const [p,l,r,b]=await Promise.all([
      supabase.from("products").select("id,sku,name,min_stock,unit:units(code,allows_decimals)").eq("active",true).order("name"),
      supabase.from("inventory_locations").select("id,name,code,location_type,work_id").eq("active",true).order("location_type").order("name"),
      supabase.from("responsibles").select("id,full_name").eq("active",true).order("full_name"),
      supabase.from("inventory_location_balances").select("product_id,location_id,quantity"),
    ]);
    const loadedLocations=(l.data||[]) as Location[];
    setProducts((p.data||[]) as unknown as Product[]); setLocations(loadedLocations); setResponsibles((r.data||[]) as Responsible[]); setBalances((b.data||[]) as Balance[]);
    const contextual=workId?loadedLocations.find(x=>x.work_id===workId):null;const depot=loadedLocations.find(x=>x.location_type==="WORKSHOP"),project=loadedLocations.find(x=>x.location_type==="PROJECT");setLocationId((kind==="OUT"?(contextual||project):depot)?.id||"");
  }

  const product=useMemo(()=>products.find(x=>x.id===material)||null,[products,material]);
  const catalog=getCatalogItem(material);
  const unit=product?.unit|| (catalog?catalogUnit(catalog):null);
  const depot=locations.find(x=>x.location_type==="WORKSHOP");
  const balanceLocationId=kind==="OUT"?depot?.id:depot?.id;
  const current=Number(balances.find(x=>x.product_id===product?.id&&x.location_id===balanceLocationId)?.quantity||0);
  const amount=Number(quantity)||0;
  const resulting=kind==="OUT"?current-amount:current+amount;

  function begin(){setKind(defaultKind);requestCode.current=`${defaultKind==="OUT"?"SR":"ER"}-${Date.now().toString().slice(-9)}`;setMaterial("");setQuantity("1");setResponsible("");setError("");setSuccess(null);setOpen(true);void load()}
  function resetAnother(){requestCode.current=`${kind==="OUT"?"SR":"ER"}-${Date.now().toString().slice(-9)}`;setMaterial("");setQuantity("1");setError("");setSuccess(null)}

  async function resolveProduct(){
    if(product)return product.id;
    if(!catalog)return null;
    const existing=products.find(x=>x.sku.toUpperCase()===catalog.code.toUpperCase()); if(existing)return existing.id;
    const [cats,units]=await Promise.all([supabase.from("categories").select("id,name").eq("active",true).order("name"),supabase.from("units").select("id,code").eq("active",true).order("code")]);
    const categoryOptions=(cats.data||[]) as CategoryOption[],unitOptions=(units.data||[]) as UnitOption[];
    const category=categoryOptions.find(x=>x.name.toLowerCase()===catalog.category.toLowerCase())||categoryOptions[0];
    const expected=catalogUnit(catalog).code; const foundUnit=unitOptions.find(x=>x.code.toUpperCase()===expected)||unitOptions.find(x=>["UN","UND","U"].includes(x.code.toUpperCase()))||unitOptions[0];
    if(!category||!foundUnit)throw new Error("Falta una categoría o unidad activa para incorporar este material.");
    const inserted=await supabase.from("products").insert({sku:catalog.code,name:catalog.name,description:catalogDescription(catalog),product_type:catalogProductType(catalog),category_id:category.id,unit_id:foundUnit.id,brand:catalog.line,color:catalog.color||null,dimensions:catalog.weight||null,weight_kg:null,min_stock:0,target_stock:0,active:true}).select("id,sku,name,min_stock,unit:units(code,allows_decimals)").single();
    if(inserted.error){const retry=await supabase.from("products").select("id").eq("sku",catalog.code).maybeSingle();if(!retry.data)throw new Error("No se pudo incorporar el material al inventario.");return retry.data.id}
    const created=inserted.data as unknown as Product;setProducts(x=>[...x,created]);return created.id;
  }

  async function save(event:FormEvent){event.preventDefault();if(saving)return;setError("");setSuccess(null);if(!material||!locationId||!responsible||amount<=0){setError("Completa material, cantidad, ubicación y responsable.");return}setSaving(true);
    try{
      const productId=await resolveProduct();if(!productId)throw new Error("Selecciona un material válido.");
      const selected=locations.find(x=>x.id===locationId);const depot=locations.find(x=>x.location_type==="WORKSHOP");if(!selected||!depot)throw new Error("Selecciona una ubicación válida.");
      let movementType="AJUSTE_ENTRADA",source:string|null=null,destination:string|null=selected.id,notes=`Entrada rápida · Entrega: ${responsible}`;
      if(kind==="OUT"){source=depot.id;destination=selected.id;movementType="TRANSFERENCIA";notes=`Salida rápida a obra · Retira: ${responsible}`}
      else if(selected.location_type==="PROJECT"&&depot){source=selected.id;destination=depot.id;movementType="TRANSFERENCIA";notes=`Devolución rápida a depósito · Entrega: ${responsible}`}
      const result=await supabase.rpc("post_location_inventory_movement",{p_code:requestCode.current,p_movement_type:movementType,p_occurred_at:new Date().toISOString(),p_source_location_id:source,p_destination_location_id:destination,p_supplier_id:null,p_document_ref:"Acción rápida",p_received_by:responsible,p_authorized_by:"",p_notes:notes,p_items:[{product_id:productId,quantity:amount,unit_cost:null}]});
      if(result.error)throw new Error(result.error.message.includes("Stock insuficiente")?"Stock insuficiente en la ubicación seleccionada.":result.error.message.includes("duplicate")?"Esta acción ya fue registrada. Actualiza el historial.":"No se pudo registrar la acción rápida.");
      setSuccess({id:result.data as string,code:requestCode.current});await load();
    }catch(problem){setError(problem instanceof Error?problem.message:"No se pudo registrar la acción rápida.")}finally{setSaving(false)}
  }

  return <>
    <button className={triggerClassName} type="button" onClick={begin} disabled={!canPost} title={canPost?`Registrar ${defaultKind==="OUT"?"salida":"entrada"} rápida`:"Tu perfil es de consulta"}><TcIcon name={defaultKind==="OUT"?"movements":"plus"} size={17}/><span>{triggerLabel}</span></button>
    {open&&typeof document!=="undefined"&&createPortal(<div className="modal-backdrop quick-action-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <section className="quick-action-panel" role="dialog" aria-modal="true" aria-label="Acción rápida de inventario">
        <header><div><p className="eyebrow">Movimiento oficial</p><h2>Acción rápida</h2><span>Registra lo cotidiano sin perder trazabilidad.</span></div><button type="button" onClick={()=>setOpen(false)} aria-label="Cerrar"><TcIcon name="close"/></button></header>
        <div className="quick-kind" role="tablist"><button type="button" className={kind==="OUT"?"active":""} onClick={()=>{setKind("OUT");setLocationId((workId?locations.find(x=>x.work_id===workId):locations.find(x=>x.location_type==="PROJECT"))?.id||"");requestCode.current=`SR-${Date.now().toString().slice(-9)}`;setSuccess(null);setError("")}}>Salida rápida</button><button type="button" className={kind==="IN"?"active":""} onClick={()=>{setKind("IN");setLocationId(locations.find(x=>x.location_type==="WORKSHOP")?.id||"");requestCode.current=`ER-${Date.now().toString().slice(-9)}`;setSuccess(null);setError("")}}>Entrada rápida</button></div>
        {success?<div className="quick-success"><i><TcIcon name="check" size={22}/></i><strong>Movimiento registrado</strong><button className="movement-code-link" type="button" onClick={()=>{setOpen(false);openMovementDetail(success.id)}}>{success.code}</button><span>Stock actualizado y auditoría guardada.</span><div><button type="button" onClick={()=>setOpen(false)}>Finalizar</button><button type="button" className="primary" onClick={resetAnother}>Registrar otro</button></div></div>:
        <form onSubmit={save}>
          {error&&<p className="error-banner" role="alert">{error}</p>}
          <label><span>1 · Material</span><CatalogMaterialPicker value={material} onChange={setMaterial} products={products}/></label>
          <div className="quick-row"><label><span>2 · Cantidad</span><div className="quick-quantity"><button type="button" onClick={()=>setQuantity(String(Math.max(unit?.allows_decimals?0.001:1,amount-(unit?.allows_decimals?0.001:1))))}>−</button><input type="number" min={unit?.allows_decimals?"0.001":"1"} step={unit?.allows_decimals?"0.001":"1"} value={quantity} onChange={e=>setQuantity(e.target.value)} required/><button type="button" onClick={()=>setQuantity(String(amount+(unit?.allows_decimals?0.001:1)))}>+</button></div></label><div className="quick-unit"><span>Unidad</span><strong>{unit?.code||"—"}</strong></div></div>
          <label><span>3 · {kind==="OUT"?"Obra de destino":"Procedencia / destino"}</span><select value={locationId} onChange={e=>setLocationId(e.target.value)} required><option value="">Seleccionar…</option>{locations.filter(x=>kind==="IN"||x.location_type==="PROJECT").map(x=><option key={x.id} value={x.id}>{x.location_type==="PROJECT"?"Obra":"Depósito"} · {x.name}</option>)}</select><small>{kind==="OUT"?`Se descuenta solamente de ${depot?.name||"Depósito"} y queda registrado en la obra.`:locations.find(x=>x.id===locationId)?.location_type==="PROJECT"?"Se registra como devolución desde la obra al depósito.":"Se incorpora al depósito seleccionado."}</small></label>
          <label><span>4 · {kind==="OUT"?"Quién retira":"Quién entrega"}</span><select value={responsible} onChange={e=>setResponsible(e.target.value)} required><option value="">Seleccionar responsable…</option>{responsibles.map(x=><option key={x.id} value={x.full_name}>{x.full_name}</option>)}</select></label>
          <div className={`quick-summary ${kind==="OUT"&&resulting<0?"danger":""}`}><div><span>Stock actual</span><strong>{formatInventoryQuantity(current,unit)} {unit?.code||""}</strong></div><b>→</b><div><span>Stock resultante</span><strong>{formatInventoryQuantity(resulting,unit)} {unit?.code||""}</strong></div></div>
          <button className="quick-submit" disabled={saving||!canPost||Boolean(kind==="OUT"&&product&&resulting<0)}>{saving?"Registrando…":kind==="OUT"?"Registrar salida":"Registrar entrada"}</button>
        </form>}
      </section>
    </div>,document.body)}
  </>
}
