"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { TcIcon } from "./icons";

type Role="ADMIN"|"GERENCIA"|"DEPOSITO"|"CONSULTA";
type Profile={user_id:string;full_name:string;role:Role;active:boolean;created_at:string;updated_at:string};
type Authorization={email:string;full_name:string;role:Role;active:boolean;claimed_by:string|null;created_at:string};
const roleDescriptions:Record<Role,string>={ADMIN:"Control total y administración de usuarios",GERENCIA:"Gestión de catálogos, obras e inventario",DEPOSITO:"Registro de movimientos y conteos",CONSULTA:"Acceso de lectura sin modificaciones"};

export default function UserModule({currentUserId}:{currentUserId:string}){
  const[profiles,setProfiles]=useState<Profile[]>([]);
  const[authorizations,setAuthorizations]=useState<Authorization[]>([]);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState("");
  const[message,setMessage]=useState("");
  const[search,setSearch]=useState("");
  const[editing,setEditing]=useState<Profile|null>(null);
  const[fullName,setFullName]=useState("");
  const[role,setRole]=useState<Role>("CONSULTA");
  const[active,setActive]=useState(true);
  const[authorizeOpen,setAuthorizeOpen]=useState(false);
  const[newEmail,setNewEmail]=useState("");
  const[newName,setNewName]=useState("");
  const[newRole,setNewRole]=useState<Role>("CONSULTA");

  async function load(){
    setLoading(true);setError("");
    const[profileResult,authorizationResult]=await Promise.all([
      supabase.from("profiles").select("user_id,full_name,role,active,created_at,updated_at").order("full_name"),
      supabase.from("access_authorizations").select("email,full_name,role,active,claimed_by,created_at").order("created_at",{ascending:false})
    ]);
    const problem=profileResult.error||authorizationResult.error;
    if(problem)setError("No se pudieron cargar los usuarios. Verifica que tu cuenta tenga rol ADMIN.");else{setProfiles((profileResult.data||[]) as Profile[]);setAuthorizations((authorizationResult.data||[]) as Authorization[]);}
    setLoading(false);
  }

  useEffect(()=>{const timer=window.setTimeout(()=>{void load();},0);return()=>window.clearTimeout(timer);},[]);
  const filtered=useMemo(()=>{const term=search.trim().toLowerCase();return profiles.filter(item=>!term||`${item.full_name} ${item.role}`.toLowerCase().includes(term));},[profiles,search]);

  function openEdit(profile:Profile){setEditing(profile);setFullName(profile.full_name);setRole(profile.role);setActive(profile.active);setError("");setMessage("");}

  async function save(event:FormEvent){
    event.preventDefault();if(!editing)return;
    setSaving(true);setError("");
    const isSelf=editing.user_id===currentUserId;
    const payload={full_name:fullName.trim(),role:isSelf?editing.role:role,active:isSelf?true:active};
    const{error:problem}=await supabase.from("profiles").update(payload).eq("user_id",editing.user_id);
    if(problem)setError("No se pudo actualizar el usuario. Solo un administrador puede cambiar permisos.");else{setEditing(null);setMessage("Usuario actualizado correctamente.");await load();}
    setSaving(false);
  }

  async function authorize(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    const{error:problem}=await supabase.from("access_authorizations").insert({email:newEmail.trim().toLowerCase(),full_name:newName.trim(),role:newRole,active:true});
    if(problem)setError(problem.code==="23505"?"Ese correo ya fue autorizado anteriormente.":"No se pudo autorizar el correo.");else{setAuthorizeOpen(false);setNewEmail("");setNewName("");setNewRole("CONSULTA");setMessage("Correo autorizado. El usuario ya puede crear su contraseña desde el ingreso normal.");await load();}
    setSaving(false);
  }

  const adminCount=profiles.filter(item=>item.active&&item.role==="ADMIN").length;
  const pending=authorizations.filter(item=>item.active&&!item.claimed_by);
  return <section className="catalog-workspace user-workspace">
    <div className="catalog-heading"><div><p className="eyebrow">Seguridad y acceso</p><h2>Usuarios y permisos</h2><p>Controla quién puede ingresar y qué operaciones puede realizar dentro del inventario.</p></div><button className="primary-action" onClick={()=>{setAuthorizeOpen(true);setError("");setMessage("");}}><TcIcon name="plus" size={16}/>Autorizar usuario</button></div>
    <div className="catalog-stats"><article><span>Usuarios</span><b>{profiles.length}</b><small>perfiles registrados</small></article><article><span>Pendientes</span><b>{pending.length}</b><small>aún no crearon contraseña</small></article><article><span>Administradores</span><b>{adminCount}</b><small>control total</small></article></div>
    <div className="permission-guide">{(Object.keys(roleDescriptions) as Role[]).map(item=><div key={item}><b>{item}</b><span>{roleDescriptions[item]}</span></div>)}</div>
    {message&&<p className="success-banner">✓ {message}</p>}{error&&!editing&&<p className="error-banner">{error}</p>}
    <div className="catalog-card"><div className="catalog-toolbar"><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar por nombre o rol…"/><span>{filtered.length} usuarios</span></div>{loading?<div className="catalog-loading"><div className="spinner"/><span>Cargando usuarios…</span></div>:<><div className="table-scroll"><table className="data-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Permisos</th><th>Estado</th><th>Última modificación</th><th/></tr></thead><tbody>{filtered.map(item=><tr key={item.user_id}><td><strong>{item.full_name}</strong><small>{item.user_id===currentUserId?"Tu cuenta":"Cuenta autorizada"}</small></td><td><b className="sku">{item.role}</b></td><td>{roleDescriptions[item.role]}</td><td><span className={item.active?"status active":"status"}>{item.active?"Activo":"Bloqueado"}</span></td><td>{formatDateTime(item.updated_at)}</td><td><button className="row-action" onClick={()=>openEdit(item)}>Editar permisos</button></td></tr>)}</tbody></table></div>{!filtered.length&&<div className="catalog-empty"><strong>Sin resultados</strong><span>No hay usuarios que coincidan con la búsqueda.</span></div>}</>}</div>
    {pending.length>0&&<div className="pending-users"><div><strong>Esperando primer ingreso</strong><span>Estos usuarios ya pueden crear su contraseña desde la pantalla normal.</span></div>{pending.map(item=><article key={item.email}><div><b>{item.full_name}</b><span>{item.email}</span></div><em>{item.role}</em></article>)}</div>}
    <p className="security-note">Las contraseñas están protegidas y nunca se muestran aquí. Desactivar un usuario bloquea su acceso, pero conserva todo su historial.</p>
    {editing&&<div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setEditing(null);}}><section className="catalog-modal user-modal" role="dialog" aria-modal="true" aria-label="Editar usuario"><div className="modal-title"><div><p className="eyebrow">Control de acceso</p><h3>Editar usuario</h3></div><button onClick={()=>setEditing(null)} aria-label="Cerrar">×</button></div>{error&&<p className="error-banner">{error}</p>}<form className="catalog-form" onSubmit={save}><label>Nombre completo<input value={fullName} onChange={event=>setFullName(event.target.value)} required minLength={2}/></label><label>Rol<select value={role} onChange={event=>setRole(event.target.value as Role)} disabled={editing.user_id===currentUserId}>{(Object.keys(roleDescriptions) as Role[]).map(item=><option key={item} value={item}>{item} · {roleDescriptions[item]}</option>)}</select></label><label className="check"><input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)} disabled={editing.user_id===currentUserId}/> Usuario activo</label>{editing.user_id===currentUserId&&<p className="self-protection">Tu propia cuenta administrativa no puede bloquearse ni cambiar de rol desde aquí, evitando que pierdas el acceso.</p>}<div className="form-actions"><button type="button" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary-action" type="submit" disabled={saving}>{saving?"Guardando…":"Guardar cambios"}</button></div></form></section></div>}
    {authorizeOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setAuthorizeOpen(false);}}><section className="catalog-modal user-modal" role="dialog" aria-modal="true" aria-label="Autorizar usuario"><div className="modal-title"><div><p className="eyebrow">Primer acceso</p><h3>Autorizar nuevo usuario</h3></div><button onClick={()=>setAuthorizeOpen(false)} aria-label="Cerrar">×</button></div>{error&&<p className="error-banner">{error}</p>}<form className="catalog-form" onSubmit={authorize}><label>Nombre completo<input value={newName} onChange={event=>setNewName(event.target.value)} required minLength={2}/></label><label>Correo electrónico<input type="email" value={newEmail} onChange={event=>setNewEmail(event.target.value)} required/></label><label>Rol<select value={newRole} onChange={event=>setNewRole(event.target.value as Role)}>{(Object.keys(roleDescriptions) as Role[]).map(item=><option key={item} value={item}>{item} · {roleDescriptions[item]}</option>)}</select></label><p className="self-protection">El usuario entra con este correo y la primera contraseña segura que elija. No necesita recibir una invitación.</p><div className="form-actions"><button type="button" onClick={()=>setAuthorizeOpen(false)}>Cancelar</button><button className="primary-action" type="submit" disabled={saving}>{saving?"Autorizando…":"Autorizar acceso"}</button></div></form></section></div>}
  </section>;
}

function formatDateTime(value:string){return new Intl.DateTimeFormat("es-PY",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"America/Asuncion"}).format(new Date(value));}
