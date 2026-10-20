-- Tecni Cristal Inventario — activación simple de cuentas previamente autorizadas.
create table public.access_authorizations (
  email text primary key check (email = lower(trim(email))),
  full_name text not null check (length(trim(full_name)) >= 2),
  role public.app_role not null default 'CONSULTA',
  active boolean not null default true,
  claimed_by uuid unique references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.access_authorizations enable row level security;
create policy "access_authorizations_admin_read" on public.access_authorizations for select to authenticated
using (public.current_app_role()='ADMIN');
create policy "access_authorizations_admin_insert" on public.access_authorizations for insert to authenticated
with check (public.current_app_role()='ADMIN');
create policy "access_authorizations_admin_update" on public.access_authorizations for update to authenticated
using (public.current_app_role()='ADMIN') with check (public.current_app_role()='ADMIN');

create trigger access_authorizations_set_updated_audit_fields before update on public.access_authorizations
for each row execute function public.set_updated_audit_fields();

create or replace function public.can_activate_account(p_email text)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.access_authorizations
    where email=lower(trim(p_email)) and active=true and claimed_by is null
  )
$$;
revoke all on function public.can_activate_account(text) from public;
grant execute on function public.can_activate_account(text) to anon, authenticated;

create or replace function public.activate_authorized_profile()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_access public.access_authorizations%rowtype;
begin
  select * into v_access from public.access_authorizations
  where email=lower(trim(new.email)) and active=true and claimed_by is null
  for update;

  if found then
    insert into public.profiles(user_id,full_name,role,active)
    values(new.id,v_access.full_name,v_access.role,true)
    on conflict(user_id) do nothing;

    update public.access_authorizations
    set claimed_by=new.id,claimed_at=now(),updated_at=now(),updated_by=new.id
    where email=v_access.email;
  end if;
  return new;
end;
$$;

drop trigger if exists activate_authorized_profile_on_signup on auth.users;
create trigger activate_authorized_profile_on_signup
after insert on auth.users for each row execute function public.activate_authorized_profile();
