-- Tecni Cristal Inventario — Fase 2: catálogo maestro de proveedores.
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) >= 2),
  business_name text not null check (length(trim(business_name)) >= 2),
  trade_name text,
  tax_id text unique,
  contact_name text,
  phone text,
  email text,
  address text,
  city text,
  country text not null default 'Paraguay',
  payment_terms_days integer not null default 0 check (payment_terms_days >= 0),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists suppliers_active_name_idx on public.suppliers (active, business_name);
alter table public.suppliers enable row level security;

create policy "suppliers_authenticated_read" on public.suppliers for select to authenticated
using (public.current_app_role() is not null);
create policy "suppliers_management_insert" on public.suppliers for insert to authenticated
with check (public.current_app_role() in ('ADMIN','GERENCIA'));
create policy "suppliers_management_update" on public.suppliers for update to authenticated
using (public.current_app_role() in ('ADMIN','GERENCIA'))
with check (public.current_app_role() in ('ADMIN','GERENCIA'));

create trigger suppliers_set_updated_audit_fields before update on public.suppliers
for each row execute function public.set_updated_audit_fields();
