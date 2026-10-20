-- Tecni Cristal Inventario — Fase 1: usuarios, roles y seguridad.
create extension if not exists pgcrypto;
create type public.app_role as enum ('ADMIN','GERENCIA','DEPOSITO','CONSULTA');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) >= 2),
  role public.app_role not null default 'CONSULTA',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index profiles_role_active_idx on public.profiles (role, active);
alter table public.profiles enable row level security;

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path=public
as $$ select role from public.profiles where user_id=auth.uid() and active=true limit 1 $$;
revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

create policy "profiles_read_self_or_management" on public.profiles for select to authenticated
using (user_id=auth.uid() or public.current_app_role() in ('ADMIN','GERENCIA'));
create policy "profiles_admin_insert" on public.profiles for insert to authenticated
with check (public.current_app_role()='ADMIN');
create policy "profiles_admin_update" on public.profiles for update to authenticated
using (public.current_app_role()='ADMIN') with check (public.current_app_role()='ADMIN');
-- Sin política DELETE: un usuario se desactiva y conserva su historial.

create or replace function public.set_updated_audit_fields()
returns trigger language plpgsql security invoker set search_path=public as $$
begin new.updated_at=now(); new.updated_by=auth.uid(); return new; end; $$;
create trigger profiles_set_updated_audit_fields before update on public.profiles
for each row execute function public.set_updated_audit_fields();
