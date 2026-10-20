"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { TcIcon } from "./icons";

type Role = "ADMIN" | "GERENCIA" | "DEPOSITO" | "CONSULTA";
type Supplier = {
  id: string;
  code: string;
  business_name: string;
  trade_name: string | null;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string;
  payment_terms_days: number;
  notes: string | null;
  active: boolean;
};

const emptyForm = {
  code: "", business_name: "", trade_name: "", tax_id: "", contact_name: "",
  phone: "", email: "", address: "", city: "", country: "Paraguay",
  payment_terms_days: "0", notes: "", active: true,
};

export default function SupplierModule({ role }: { role: Role }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const canManage = role === "ADMIN" || role === "GERENCIA";

  async function loadData() {
    setLoading(true); setError("");
    const { data, error: problem } = await supabase.from("suppliers")
      .select("id,code,business_name,trade_name,tax_id,contact_name,phone,email,address,city,country,payment_terms_days,notes,active")
      .order("business_name");
    if (problem) setError("No se pudieron cargar los proveedores. Intenta actualizar la página.");
    else setSuppliers((data || []) as Supplier[]);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return suppliers.filter(item => {
      const matchesStatus = status === "all" || (status === "active" ? item.active : !item.active);
      const text = `${item.code} ${item.business_name} ${item.trade_name || ""} ${item.tax_id || ""} ${item.contact_name || ""}`.toLowerCase();
      return matchesStatus && (!term || text.includes(term));
    });
  }, [suppliers, search, status]);

  function openCreate() {
    setEditingId(null); setForm(emptyForm); setError(""); setMessage(""); setModalOpen(true);
  }

  function openEdit(item: Supplier) {
    setEditingId(item.id); setError(""); setMessage("");
    setForm({
      code: item.code, business_name: item.business_name, trade_name: item.trade_name || "",
      tax_id: item.tax_id || "", contact_name: item.contact_name || "", phone: item.phone || "",
      email: item.email || "", address: item.address || "", city: item.city || "",
      country: item.country, payment_terms_days: String(item.payment_terms_days),
      notes: item.notes || "", active: item.active,
    });
    setModalOpen(true);
  }

  async function saveSupplier(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const payload = {
      code: form.code.trim().toUpperCase(), business_name: form.business_name.trim(),
      trade_name: form.trade_name.trim() || null, tax_id: form.tax_id.trim() || null,
      contact_name: form.contact_name.trim() || null, phone: form.phone.trim() || null,
      email: form.email.trim() || null, address: form.address.trim() || null,
      city: form.city.trim() || null, country: form.country.trim() || "Paraguay",
      payment_terms_days: Number(form.payment_terms_days || 0), notes: form.notes.trim() || null,
      active: form.active,
    };
    const result = editingId
      ? await supabase.from("suppliers").update(payload).eq("id", editingId)
      : await supabase.from("suppliers").insert(payload);
    if (result.error) setError(result.error.code === "23505" ? "El código o RUC ya está registrado." : "No se pudo guardar. Revisa los datos e intenta nuevamente.");
    else {
      setModalOpen(false); setMessage(editingId ? "Proveedor actualizado." : "Proveedor creado correctamente.");
      await loadData();
    }
    setSaving(false);
  }

  return <section className="catalog-workspace">
    <div className="catalog-heading">
      <div><p className="eyebrow">Fase 2 · Catálogos maestros</p><h2>Directorio de proveedores</h2><p>Centraliza los datos comerciales y de contacto para futuras compras.</p></div>
      {canManage && <button className="primary-action" onClick={openCreate}><TcIcon name="plus" size={16}/>Nuevo proveedor</button>}
    </div>
    <div className="catalog-stats">
      <article><span>Proveedores</span><b>{suppliers.length}</b><small>registros totales</small></article>
      <article><span>Activos</span><b>{suppliers.filter(x => x.active).length}</b><small>disponibles para compras</small></article>
      <article><span>Con crédito</span><b>{suppliers.filter(x => x.payment_terms_days > 0).length}</b><small>plazo de pago registrado</small></article>
    </div>
    {message && <p className="success-banner">✓ {message}</p>}
    {error && !modalOpen && <p className="error-banner">{error}</p>}
    <div className="catalog-card">
      <div className="catalog-toolbar">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por código, empresa, RUC o contacto…" />
        <select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select>
        <span>{filtered.length} registros</span>
      </div>
      {loading ? <div className="catalog-loading"><div className="spinner"/><span>Cargando proveedores…</span></div> : <>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Código</th><th>Proveedor</th><th>RUC</th><th>Contacto</th><th>Condición</th><th>Estado</th><th/></tr></thead><tbody>
          {filtered.map(item => <tr key={item.id}><td><b className="sku">{item.code}</b></td><td><strong>{item.business_name}</strong><small>{item.trade_name || [item.city, item.country].filter(Boolean).join(" · ")}</small></td><td>{item.tax_id || "—"}</td><td><strong>{item.contact_name || "Sin contacto"}</strong><small>{item.phone || item.email || "Sin datos"}</small></td><td>{item.payment_terms_days ? `${item.payment_terms_days} días` : "Contado"}</td><td><Status active={item.active}/></td><td>{canManage && <button className="row-action" onClick={() => openEdit(item)}>Editar</button>}</td></tr>)}
        </tbody></table></div>
        {!filtered.length && <Empty text={suppliers.length ? "No hay proveedores con esos filtros." : "Crea el primer proveedor para comenzar."}/>} 
      </>}
    </div>
    {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setModalOpen(false); }}><section className="catalog-modal" role="dialog" aria-modal="true" aria-label={editingId ? "Editar proveedor" : "Nuevo proveedor"}>
      <div className="modal-title"><div><p className="eyebrow">Catálogo maestro</p><h3>{editingId ? "Editar proveedor" : "Nuevo proveedor"}</h3></div><button type="button" onClick={() => setModalOpen(false)} aria-label="Cerrar">×</button></div>
      {error && <p className="error-banner">{error}</p>}
      <form className="catalog-form" onSubmit={saveSupplier}><div className="form-grid">
        <Field label="Código"><input value={form.code} maxLength={30} onChange={e => setForm({...form, code:e.target.value.toUpperCase()})} placeholder="Ej. PROV-001" required/></Field>
        <Field label="Razón social"><input value={form.business_name} onChange={e => setForm({...form, business_name:e.target.value})} required/></Field>
        <Field label="Nombre comercial"><input value={form.trade_name} onChange={e => setForm({...form, trade_name:e.target.value})}/></Field>
        <Field label="RUC / identificación fiscal"><input value={form.tax_id} onChange={e => setForm({...form, tax_id:e.target.value})}/></Field>
        <Field label="Persona de contacto"><input value={form.contact_name} onChange={e => setForm({...form, contact_name:e.target.value})}/></Field>
        <Field label="Teléfono"><input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})}/></Field>
        <Field label="Correo"><input type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})}/></Field>
        <Field label="Plazo de pago (días)"><input type="number" min="0" value={form.payment_terms_days} onChange={e => setForm({...form, payment_terms_days:e.target.value})}/></Field>
        <Field label="Ciudad"><input value={form.city} onChange={e => setForm({...form, city:e.target.value})}/></Field>
        <Field label="País"><input value={form.country} onChange={e => setForm({...form, country:e.target.value})} required/></Field>
        <Field label="Dirección" wide><input value={form.address} onChange={e => setForm({...form, address:e.target.value})}/></Field>
        <Field label="Observaciones" wide><textarea value={form.notes} onChange={e => setForm({...form, notes:e.target.value})}/></Field>
      </div><label className="check"><input type="checkbox" checked={form.active} onChange={e => setForm({...form, active:e.target.checked})}/> Proveedor activo</label><div className="form-actions"><button type="button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="primary-action" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar proveedor"}</button></div></form>
    </section></div>}
  </section>;
}

function Field({ label, wide, children }: { label:string; wide?:boolean; children:React.ReactNode }) { return <label className={wide ? "wide" : ""}>{label}{children}</label>; }
function Status({ active }: { active:boolean }) { return <span className={active ? "status active" : "status"}>{active ? "Activo" : "Inactivo"}</span>; }
function Empty({ text }: { text:string }) { return <div className="catalog-empty"><strong>Sin registros</strong><span>{text}</span></div>; }
