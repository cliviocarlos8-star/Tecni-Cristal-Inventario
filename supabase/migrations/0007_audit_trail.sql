-- Auditoría, trazabilidad y revisión sensible (append-only).
create extension if not exists pgcrypto;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_label text,
  location_id uuid references public.inventory_locations(id) on delete set null,
  work_id uuid references public.works(id) on delete set null,
  severity text not null default 'INFO' check (severity in ('INFO','WARNING','CRITICAL')),
  status text not null default 'CONFIRMED' check (status in ('DRAFT','CONFIRMED','REVERSED','CANCELLED','CORRECTED')),
  reason text,
  authorized_by uuid references auth.users(id) on delete set null,
  correlation_id uuid not null default gen_random_uuid(),
  related_event_id uuid references public.audit_events(id),
  before_data jsonb,
  after_data jsonb,
  changes jsonb,
  metadata jsonb not null default '{}'::jsonb,
  session_id text,
  request_id text
);

create index if not exists audit_events_created_idx on public.audit_events(created_at desc, id desc);
create index if not exists audit_events_actor_idx on public.audit_events(actor_user_id, created_at desc);
create index if not exists audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);
create index if not exists audit_events_location_idx on public.audit_events(location_id, created_at desc);
create index if not exists audit_events_action_idx on public.audit_events(action, created_at desc);
create index if not exists audit_events_correlation_idx on public.audit_events(correlation_id);
create index if not exists audit_events_related_idx on public.audit_events(related_event_id);

create table if not exists public.audit_alerts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.audit_events(id),
  created_at timestamptz not null default now(),
  status text not null default 'NEW' check (status in ('NEW','REVIEWING','RESOLVED','DISMISSED')),
  assigned_to uuid references auth.users(id) on delete set null,
  comment text,
  closed_at timestamptz
);

alter table public.audit_events enable row level security;
alter table public.audit_alerts enable row level security;

create or replace function public.current_inventory_role() returns text language sql stable security definer set search_path=public as $$
  select role::text from public.profiles where user_id=auth.uid() and active=true limit 1
$$;

drop policy if exists audit_read_authorized on public.audit_events;
create policy audit_read_authorized on public.audit_events for select to authenticated
using (public.current_inventory_role() in ('ADMIN','GERENCIA') or actor_user_id=auth.uid());
drop policy if exists audit_alert_read_authorized on public.audit_alerts;
create policy audit_alert_read_authorized on public.audit_alerts for select to authenticated
using (public.current_inventory_role() in ('ADMIN','GERENCIA'));

revoke insert, update, delete on public.audit_events from anon, authenticated;
revoke insert, update, delete on public.audit_alerts from anon;

create or replace function public.audit_write(
  p_action text, p_entity_type text, p_entity_id uuid default null, p_entity_label text default null,
  p_location_id uuid default null, p_work_id uuid default null, p_reason text default null,
  p_authorized_by uuid default null, p_before jsonb default null, p_after jsonb default null,
  p_changes jsonb default null, p_metadata jsonb default '{}'::jsonb, p_severity text default 'INFO',
  p_status text default 'CONFIRMED', p_correlation_id uuid default null, p_related_event_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_name text;
begin
  select full_name into v_name from public.profiles where user_id=auth.uid();
  insert into public.audit_events(actor_user_id,actor_name,action,entity_type,entity_id,entity_label,location_id,work_id,reason,authorized_by,before_data,after_data,changes,metadata,severity,status,correlation_id,related_event_id)
  values(auth.uid(),v_name,p_action,p_entity_type,p_entity_id,p_entity_label,p_location_id,p_work_id,p_reason,p_authorized_by,p_before,p_after,p_changes,
    coalesce(p_metadata,'{}'::jsonb) - array['password','token','access_token','refresh_token','secret','authorization'],p_severity,p_status,coalesce(p_correlation_id,gen_random_uuid()),p_related_event_id)
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.audit_write(text,text,uuid,text,uuid,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,text,text,uuid,uuid) to authenticated;

create or replace function public.audit_immutable_guard() returns trigger language plpgsql as $$
begin raise exception 'Los eventos de auditoría son inmutables'; end $$;
drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable before update or delete on public.audit_events for each row execute function public.audit_immutable_guard();

create or replace function public.audit_inventory_movement_created() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.audit_write('MOVEMENT_CREATED','inventory_movement',new.id,new.code,new.destination_location_id,new.work_id,new.notes,null,null,to_jsonb(new),null,jsonb_build_object('movement_type',new.movement_type),'INFO','CONFIRMED',null,null);
  return new;
end $$;
drop trigger if exists inventory_movement_audit_insert on public.inventory_movements;
create trigger inventory_movement_audit_insert after insert on public.inventory_movements for each row execute function public.audit_inventory_movement_created();

comment on table public.audit_events is 'Registro append-only. Nunca usar como fuente del stock actual.';
