"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { TcIcon } from "./icons";
import { formatInventoryQuantity, stockAlertLevel } from "./inventory-format";

type Product={id:string;sku:string;name:string;min_stock:number;target_stock:number;unit:{code:string;allows_decimals?:boolean|null}|null};
type Warehouse={id:string;code:string;name:string};
type Balance={product_id:string;warehouse_id:string;quantity:number};
type AlertRow=Product&{warehouse:Warehouse;quantity:number;level:"critical"|"warning";reorder:number};

export default function StockAlertsModule({onNavigate}:{onNavigate:(section:string)=>void}){
  const[products,setProducts]=useState<Product[]>([]);
  const[warehouses,setWarehouses]=useState<Warehouse[]>([]);
  const[balances,setBalances]=useState<Balance[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  const[filter,setFilter]=useState<"all"|"critical"|"warning">("all");
  const[warehouseId,setWarehouseId]=useState("");
  const[search,setSearch]=useState("");

  useEffect(()=>{const timer=window.setTimeout(async()=>{
    const[p,w,b]=await Promise.all([
      supabase.from("products").select("id,sku,name,min_stock,target_stock,unit:units(code,allows_decimals)").eq("active",true).order("name"),
      supabase.from("warehouses").select("id,code,name").eq("active",true).order("name"),
      supabase.from("inventory_balances").select("product_id,warehouse_id,quantity")
    ]);
    if(p.error||w.error||b.error)setError("No se pudieron calcular las alertas de stock.");
    else{setProducts((p.data||[]) as unknown as Product[]);setWarehouses((w.data||[]) as Warehouse[]);setBalances((b.data||[]) as Balance[]);}
    setLoading(false);
  },0);return()=>window.clearTimeout(timer);},[]);

  const alerts=useMemo<AlertRow[]>(()=>{
    const stock=new Map(balances.map(row=>[`${row.product_id}:${row.warehouse_id}`,Number(row.quantity)]));
    const rows:AlertRow[]=[];
    products.forEach(product=>warehouses.forEach(warehouse=>{
      const quantity=stock.get(`${product.id}:${warehouse.id}`)||0;
      const level=stockAlertLevel(quantity,product.min_stock);
      if(level)rows.push({...product,warehouse,quantity,level,reorder:Math.max(0,Number(product.target_stock)-quantity)});
    }));
    return rows.sort((a,b)=>a.level.localeCompare(b.level)||a.quantity-b.quantity||a.name.localeCompare(b.name));
  },[products,warehouses,balances]);
  const visible=alerts.filter(row=>(filter==="all"||row.level===filter)&&(!warehouseId||row.warehouse.id===warehouseId)&&(`${row.sku} ${row.name}`.toLowerCase().includes(search.trim().toLowerCase())));
  const critical=alerts.filter(row=>row.level==="critical").length;
  const warning=alerts.filter(row=>row.level==="warning").length;

  if(loading)return <div className="dashboard-loading"><div className="spinner"/><span>Calculando alertas…</span></div>;
  return <section className="catalog-workspace stock-alerts">
    <div className="catalog-heading"><div><p className="eyebrow">Control preventivo</p><h2>Alertas de stock</h2><p>Revisa faltantes por producto y depósito antes de que afecten una obra.</p></div><button className="primary-action" onClick={()=>onNavigate("Movimientos")}><TcIcon name="plus" size={16}/>Registrar compra o entrada</button></div>
    {error&&<p className="error-banner">{error}</p>}
    <div className="alert-summary"><button className={filter==="all"?"selected":""} onClick={()=>setFilter("all")}><span>Total por revisar</span><b>{alerts.length}</b><small>producto · depósito</small></button><button className={`critical ${filter==="critical"?"selected":""}`} onClick={()=>setFilter("critical")}><span>Stock crítico</span><b>{critical}</b><small>en mínimo o por debajo</small></button><button className={`warning ${filter==="warning"?"selected":""}`} onClick={()=>setFilter("warning")}><span>Próximo al mínimo</span><b>{warning}</b><small>aviso preventivo</small></button></div>
    <div className="catalog-card"><div className="catalog-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por SKU o producto…"/><select value={warehouseId} onChange={e=>setWarehouseId(e.target.value)}><option value="">Todos los depósitos</option>{warehouses.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select><span>{visible.length} alertas</span></div>
      {visible.length?<div className="table-scroll"><table className="data-table alert-table"><thead><tr><th>Nivel</th><th>Producto</th><th>Depósito</th><th>Disponible</th><th>Mínimo</th><th>Objetivo</th><th>Reponer</th></tr></thead><tbody>{visible.map(row=><tr key={`${row.id}:${row.warehouse.id}`}><td><span className={`stock-level ${row.level}`}>{row.level==="critical"?"Crítico":"Preventivo"}</span></td><td><strong>{row.name}</strong><small>{row.sku}</small></td><td><strong>{row.warehouse.name}</strong><small>{row.warehouse.code}</small></td><td>{formatInventoryQuantity(row.quantity,row.unit)} {row.unit?.code||""}</td><td>{formatInventoryQuantity(row.min_stock,row.unit)}</td><td>{formatInventoryQuantity(row.target_stock,row.unit)}</td><td><b className="reorder">{formatInventoryQuantity(row.reorder,row.unit)} {row.unit?.code||""}</b></td></tr>)}</tbody></table></div>:<div className="dashboard-ok"><b>✓</b><strong>Sin alertas con estos filtros</strong><span>Los productos visibles se encuentran por encima del nivel preventivo.</span></div>}
    </div>
    <p className="alert-note">La alerta roja aparece cuando el stock alcanza o baja del mínimo. La amarilla avisa cuando está hasta 25% por encima. “Reponer” calcula lo necesario para llegar al stock objetivo.</p>
  </section>;
}
