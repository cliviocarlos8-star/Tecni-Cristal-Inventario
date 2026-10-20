"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { TcIcon } from "./icons";

type Role="ADMIN"|"GERENCIA"|"DEPOSITO"|"CONSULTA";
type Panel="works"|"responsibles";
type Responsible={id:string;code:string;full_name:string;position:string|null;phone:string|null;email:string|null;notes:string|null;active:boolean};
type Work={id:string;code:string;name:string;client_name:string;address:string|null;city:string|null;responsible_id:string|null;start_date:string|null;expected_end_date:string|null;status:string;notes:string|null;active:boolean;responsible:{full_name:string;code:string}|null};

const emptyResponsible={code:"",full_name:"",position:"",phone:"",email:"",notes:"",active:true};
const emptyWork={code:"",name:"",client_name:"",address:"",city:"",responsible_id:"",start_date:"",expected_end_date:"",status:"PLANIFICACION",notes:"",active:true};
const statusLabels:Record<string,string>={PLANIFICACION:"Planificación",EN_CURSO:"En curso",PAUSADA:"Pausada",FINALIZADA:"Finalizada",CANCELADA:"Cancelada"};

export default function WorkModule({role,onOpenWork}:{role:Role;onOpenWork:(workId:string)=>void}){
  const[panel,setPanel]=useState<Panel>("works");
  const[works,setWorks]=useState<Work[]>([]);
  const[responsibles,setResponsibles]=useState<Responsible[]>([]);
  const[search,setSearch]=useState("");
  const[statusFilter,setStatusFilter]=useState("all");
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[message,setMessage]=useState("");
  const[error,setError]=useState("");
  const[modal,setModal]=useState<{kind:Panel;id?:string}|null>(null);
  const[responsibleForm,setResponsibleForm]=useState(emptyResponsible);
  const[workForm,setWorkForm]=useState(emptyWork);
  const canManage=role==="ADMIN"||role==="GERENCIA";

  async function loadData(){
    setLoading(true);setError("");
    const[responsibleResult,workResult]=await Promise.all([
      supabase.from("responsibles").select("id,code,full_name,position,phone,email,notes,active").order("full_name"),
      supabase.from("works").select("id,code,name,client_name,address,city,responsible_id,start_date,expected_end_date,status,notes,active,responsible:responsibles(full_name,code)").order("name")
    ]);
    const problem=responsibleResult.error||workResult.error;
    if(problem)setError("No se pudieron cargar las obras. Intenta actualizar la página.");
    else{setResponsibles((responsibleResult.data||[]) as Responsible[]);setWorks((workResult.data||[]) as unknown as Work[]);}
    setLoading(false);
  }

  useEffect(()=>{const timer=window.setTimeout(()=>{void loadData();},0);return()=>window.clearTimeout(timer);},[]);

  const filteredWorks=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return works.filter(item=>(statusFilter==="all"||item.status===statusFilter)&&(!term||`${item.code} ${item.name} ${item.client_name} ${item.city||""} ${item.responsible?.full_name||""}`.toLowerCase().includes(term)));
  },[works,search,statusFilter]);
  const filteredResponsibles=useMemo(()=>{const term=search.trim().toLowerCase();return responsibles.filter(item=>!term||`${item.code} ${item.full_name} ${item.position||""} ${item.phone||""}`.toLowerCase().includes(term));},[responsibles,search]);

  function openCreate(kind:Panel){setModal({kind});setError("");setMessage("");if(kind==="works")setWorkForm({...emptyWork,responsible_id:responsibles.find(item=>item.active)?.id||""});else setResponsibleForm(emptyResponsible);}
  function openEditWork(item:Work){setModal({kind:"works",id:item.id});setError("");setMessage("");setWorkForm({code:item.code,name:item.name,client_name:item.client_name,address:item.address||"",city:item.city||"",responsible_id:item.responsible_id||"",start_date:item.start_date||"",expected_end_date:item.expected_end_date||"",status:item.status,notes:item.notes||"",active:item.active});}
  function openEditResponsible(item:Responsible){setModal({kind:"responsibles",id:item.id});setError("");setMessage("");setResponsibleForm({code:item.code,full_name:item.full_name,position:item.position||"",phone:item.phone||"",email:item.email||"",notes:item.notes||"",active:item.active});}
  function friendlyError(code?:string,message?:string){return message?.includes("mantiene existencias")?"La obra mantiene materiales. Transfiere, devuelve o consume el stock antes de finalizarla, cancelarla o desactivarla.":code==="23505"?"Ese código ya está registrado.":code==="23503"?"Selecciona un responsable válido.":"No se pudo guardar. Revisa los datos e intenta nuevamente.";}

  async function saveResponsible(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    const payload={code:responsibleForm.code.trim().toUpperCase(),full_name:responsibleForm.full_name.trim(),position:responsibleForm.position.trim()||null,phone:responsibleForm.phone.trim()||null,email:responsibleForm.email.trim()||null,notes:responsibleForm.notes.trim()||null,active:responsibleForm.active};
    const result=modal?.id?await supabase.from("responsibles").update(payload).eq("id",modal.id):await supabase.from("responsibles").insert(payload);
    if(result.error)setError(friendlyError(result.error.code,result.error.message));else{setModal(null);setMessage(modal?.id?"Responsable actualizado.":"Responsable creado correctamente.");await loadData();}setSaving(false);
  }

  async function saveWork(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    const payload={code:workForm.code.trim().toUpperCase(),name:workForm.name.trim(),client_name:workForm.client_name.trim(),address:workForm.address.trim()||null,city:workForm.city.trim()||null,responsible_id:workForm.responsible_id||null,start_date:workForm.start_date||null,expected_end_date:workForm.expected_end_date||null,status:workForm.status,notes:workForm.notes.trim()||null,active:workForm.active};
    const result=modal?.id?await supabase.from("works").update(payload).eq("id",modal.id):await supabase.from("works").insert(payload);
    if(result.error)setError(friendlyError(result.error.code,result.error.message));else{setModal(null);setMessage(modal?.id?"Obra actualizada.":"Obra creada correctamente.");await loadData();}setSaving(false);
  }

  return <section className="catalog-workspace">
    <div className="catalog-heading"><div><p className="eyebrow">Fase 2 · Catálogos maestros</p><h2>Obras y responsables</h2><p>Organiza los trabajos activos y quién está a cargo de cada uno.</p></div>{canManage&&<button className="primary-action" onClick={()=>openCreate(panel)}><TcIcon name="plus" size={16}/>{panel==="works"?"Nueva obra":"Nuevo responsable"}</button>}</div>
    <div className="catalog-stats"><article><span>Obras</span><b>{works.length}</b><small>{works.filter(x=>x.active).length} activas</small></article><article><span>En curso</span><b>{works.filter(x=>x.status==="EN_CURSO").length}</b><small>trabajos en ejecución</small></article><article><span>Responsables</span><b>{responsibles.length}</b><small>{responsibles.filter(x=>x.active).length} disponibles</small></article></div>
    <div className="catalog-tabs" role="tablist"><button className={panel==="works"?"active":""} onClick={()=>{setPanel("works");setSearch("");}}>Obras</button><button className={panel==="responsibles"?"active":""} onClick={()=>{setPanel("responsibles");setSearch("");}}>Responsables</button></div>
    {message&&<p className="success-banner">✓ {message}</p>}{error&&!modal&&<p className="error-banner">{error}</p>}
    <div className="catalog-card"><div className="catalog-toolbar"><input value={search} onChange={event=>setSearch(event.target.value)} placeholder={panel==="works"?"Buscar por obra, cliente, ciudad o responsable…":"Buscar responsable…"}/>{panel==="works"&&<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="all">Todos los estados</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>}<span>{panel==="works"?filteredWorks.length:filteredResponsibles.length} registros</span></div>
      {loading?<div className="catalog-loading"><div className="spinner"/><span>Cargando obras…</span></div>:panel==="works"?<><div className="table-scroll"><table className="data-table selectable-works"><thead><tr><th>Código</th><th>Obra</th><th>Cliente</th><th>Responsable</th><th>Fechas</th><th>Estado</th><th/></tr></thead><tbody>{filteredWorks.map(item=><tr key={item.id} onClick={()=>onOpenWork(item.id)}><td><b className="sku">{item.code}</b></td><td><button className="work-name-link" onClick={()=>onOpenWork(item.id)}>{item.name}</button><small>{[item.address,item.city].filter(Boolean).join(" · ")||"Sin ubicación"}</small></td><td>{item.client_name}</td><td>{item.responsible?.full_name||"Sin asignar"}</td><td><strong>{item.start_date?formatDate(item.start_date):"Pendiente"}</strong><small>{item.expected_end_date?`Fin previsto: ${formatDate(item.expected_end_date)}`:"Sin fecha final"}</small></td><td><span className={item.status==="EN_CURSO"?"status active":"status"}>{statusLabels[item.status]}</span></td><td><div className="row-actions"><button className="row-action" onClick={event=>{event.stopPropagation();onOpenWork(item.id)}}>Abrir ficha</button>{canManage&&<button className="row-action" onClick={event=>{event.stopPropagation();openEditWork(item)}}>Editar</button>}</div></td></tr>)}</tbody></table></div>{!filteredWorks.length&&<Empty text={works.length?"No hay obras con esos filtros.":"Crea la primera obra para comenzar."}/>}</>:<><div className="table-scroll"><table className="data-table"><thead><tr><th>Código</th><th>Responsable</th><th>Cargo / función</th><th>Contacto</th><th>Obras</th><th>Estado</th><th/></tr></thead><tbody>{filteredResponsibles.map(item=><tr key={item.id}><td><b className="sku">{item.code}</b></td><td><strong>{item.full_name}</strong><small>{item.notes||"Sin observaciones"}</small></td><td>{item.position||"—"}</td><td><strong>{item.phone||"Sin teléfono"}</strong><small>{item.email||"Sin correo"}</small></td><td>{works.filter(work=>work.responsible_id===item.id).length}</td><td><Status active={item.active}/></td><td>{canManage&&<button className="row-action" onClick={()=>openEditResponsible(item)}>Editar</button>}</td></tr>)}</tbody></table></div>{!filteredResponsibles.length&&<Empty text={responsibles.length?"No hay responsables con esa búsqueda.":"Crea el primer responsable para asignarlo a una obra."}/>}</>}
    </div>
    {modal?.kind==="responsibles"&&<Modal title={modal.id?"Editar responsable":"Nuevo responsable"} error={error} onClose={()=>setModal(null)}><form className="catalog-form" onSubmit={saveResponsible}><div className="form-grid"><Field label="Código"><input value={responsibleForm.code} onChange={e=>setResponsibleForm({...responsibleForm,code:e.target.value.toUpperCase()})} placeholder="Ej. RESP-001" required/></Field><Field label="Nombre completo"><input value={responsibleForm.full_name} onChange={e=>setResponsibleForm({...responsibleForm,full_name:e.target.value})} required/></Field><Field label="Cargo / función"><input value={responsibleForm.position} onChange={e=>setResponsibleForm({...responsibleForm,position:e.target.value})}/></Field><Field label="Teléfono"><input value={responsibleForm.phone} onChange={e=>setResponsibleForm({...responsibleForm,phone:e.target.value})}/></Field><Field label="Correo"><input type="email" value={responsibleForm.email} onChange={e=>setResponsibleForm({...responsibleForm,email:e.target.value})}/></Field><Field label="Observaciones" wide><textarea value={responsibleForm.notes} onChange={e=>setResponsibleForm({...responsibleForm,notes:e.target.value})}/></Field></div><label className="check"><input type="checkbox" checked={responsibleForm.active} onChange={e=>setResponsibleForm({...responsibleForm,active:e.target.checked})}/> Responsable activo</label><Actions saving={saving} onCancel={()=>setModal(null)}/></form></Modal>}
    {modal?.kind==="works"&&<Modal title={modal.id?"Editar obra":"Nueva obra"} error={error} onClose={()=>setModal(null)}><form className="catalog-form" onSubmit={saveWork}><div className="form-grid"><Field label="Código"><input value={workForm.code} onChange={e=>setWorkForm({...workForm,code:e.target.value.toUpperCase()})} placeholder="Ej. OBRA-001" required/></Field><Field label="Nombre de la obra"><input value={workForm.name} onChange={e=>setWorkForm({...workForm,name:e.target.value})} required/></Field><Field label="Cliente"><input value={workForm.client_name} onChange={e=>setWorkForm({...workForm,client_name:e.target.value})} required/></Field><Field label="Responsable"><select value={workForm.responsible_id} onChange={e=>setWorkForm({...workForm,responsible_id:e.target.value})}><option value="">Sin asignar</option>{responsibles.filter(item=>item.active||item.id===workForm.responsible_id).map(item=><option key={item.id} value={item.id}>{item.code} · {item.full_name}</option>)}</select></Field><Field label="Ciudad"><input value={workForm.city} onChange={e=>setWorkForm({...workForm,city:e.target.value})}/></Field><Field label="Estado"><select value={workForm.status} onChange={e=>setWorkForm({...workForm,status:e.target.value})}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field><Field label="Fecha de inicio"><input type="date" value={workForm.start_date} onChange={e=>setWorkForm({...workForm,start_date:e.target.value})}/></Field><Field label="Fecha prevista de fin"><input type="date" min={workForm.start_date||undefined} value={workForm.expected_end_date} onChange={e=>setWorkForm({...workForm,expected_end_date:e.target.value})}/></Field><Field label="Dirección" wide><input value={workForm.address} onChange={e=>setWorkForm({...workForm,address:e.target.value})}/></Field><Field label="Observaciones" wide><textarea value={workForm.notes} onChange={e=>setWorkForm({...workForm,notes:e.target.value})}/></Field></div><label className="check"><input type="checkbox" checked={workForm.active} onChange={e=>setWorkForm({...workForm,active:e.target.checked})}/> Obra activa</label><Actions saving={saving} onCancel={()=>setModal(null)}/></form></Modal>}
  </section>;
}

function Field({label,wide,children}:{label:string;wide?:boolean;children:React.ReactNode}){return <label className={wide?"wide":""}>{label}{children}</label>;}
function Modal({title,error,onClose,children}:{title:string;error:string;onClose:()=>void;children:React.ReactNode}){return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="catalog-modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-title"><div><p className="eyebrow">Catálogo maestro</p><h3>{title}</h3></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></div>{error&&<p className="error-banner">{error}</p>}{children}</section></div>;}
function Actions({saving,onCancel}:{saving:boolean;onCancel:()=>void}){return <div className="form-actions"><button type="button" onClick={onCancel}>Cancelar</button><button className="primary-action" type="submit" disabled={saving}>{saving?"Guardando…":"Guardar"}</button></div>;}
function Status({active}:{active:boolean}){return <span className={active?"status active":"status"}>{active?"Activo":"Inactivo"}</span>;}
function Empty({text}:{text:string}){return <div className="catalog-empty"><strong>Sin registros</strong><span>{text}</span></div>;}
function formatDate(value:string){return new Intl.DateTimeFormat("es-PY",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`));}
