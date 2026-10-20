-- Tecni Cristal Inventario — Fase 2: obras y responsables.
create table public.responsibles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  full_name text not null,
  position text,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table public.works (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  client_name text not null,
  address text,
  city text,
  responsible_id uuid references public.responsibles(id) on delete set null,
  start_date date,
  expected_end_date date,
  status text not null default 'PLANIFICACION'
    check (status in ('PLANIFICACION','EN_CURSO','PAUSADA','FINALIZADA','CANCELADA')),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index responsibles_active_name_idx on public.responsibles (active, full_name);
create index works_status_name_idx on public.works (status, name);
create index works_responsible_idx on public.works (responsible_id);

alter table public.responsibles enable row level security;
alter table public.works enable row level security;

create policy "responsibles_authenticated_read" on public.responsibles for select to authenticated
using (public.current_app_role() is not null);
create policy "responsibles_management_insert" on public.responsibles for insert to authenticated
with check (public.current_app_role() in ('ADMIN','GERENCIA'));
create policy "responsibles_management_update" on public.responsibles for update to authenticated
using (public.current_app_role() in ('ADMIN','GERENCIA'))
with check (public.current_app_role() in ('ADMIN','GERENCIA'));

create policy "works_authenticated_read" on public.works for select to authenticated
using (public.current_app_role() is not null);
create policy "works_management_insert" on public.works for insert to authenticated
with check (public.current_app_role() in ('ADMIN','GERENCIA'));
create policy "works_management_update" on public.works for update to authenticated
using (public.current_app_role() in ('ADMIN','GERENCIA'))
with check (public.current_app_role() in ('ADMIN','GERENCIA'));

create trigger responsibles_set_updated_audit_fields before update on public.responsibles
for each row execute function public.set_updated_audit_fields();
create trigger works_set_updated_audit_fields before update on public.works
for each row execute function public.set_updated_audit_fields();
