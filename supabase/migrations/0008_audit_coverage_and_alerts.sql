-- Cobertura ampliada y flujo de revisión de alertas.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_before jsonb; v_after jsonb; v_row jsonb; v_changes jsonb;
  v_id uuid; v_label text; v_action text; v_severity text;
begin
  v_severity:=coalesce(TG_ARGV[3],'INFO');
  if TG_OP='INSERT' then v_after:=to_jsonb(new); v_row:=v_after;
  elsif TG_OP='UPDATE' then v_before:=to_jsonb(old); v_after:=to_jsonb(new); v_row:=v_after;
  else v_before:=to_jsonb(old); v_row:=v_before; end if;

  v_id:=nullif(v_row->>TG_ARGV[1],'')::uuid;
  v_label:=coalesce(v_row->>TG_ARGV[2],TG_ARGV[0]);
  v_action:=upper(TG_ARGV[0])||'_'||case TG_OP when 'INSERT' then 'CREATED' when 'UPDATE' then 'UPDATED' else 'DEACTIVATED' end;

  if TG_ARGV[0]='product' and TG_OP='UPDATE' and v_before->'min_stock' is distinct from v_after->'min_stock' then v_action:='MIN_STOCK_UPDATED'; end if;
  if TG_ARGV[0]='user_profile' and TG_OP='UPDATE' and v_before->'role' is distinct from v_after->'role' then v_action:='ROLE_UPDATED'; v_severity:='CRITICAL'; end if;
  if TG_ARGV[0]='user_profile' and TG_OP='UPDATE' and v_before->'active' is distinct from v_after->'active' then v_action:='USER_STATUS_UPDATED'; v_severity:='CRITICAL'; end if;
  if TG_ARGV[0]='work' and TG_OP='UPDATE' and v_before->'status' is distinct from v_after->'status' then v_action:='WORK_STATUS_UPDATED'; end if;

  if TG_OP='UPDATE' then
    select coalesce(jsonb_object_agg(k,jsonb_build_object('before',v_before->k,'after',v_after->k)),'{}'::jsonb)
      into v_changes from (select jsonb_object_keys(v_before||v_after) k) s
      where v_before->k is distinct from v_after->k;
  end if;

  perform public.audit_write(v_action,TG_ARGV[0],v_id,v_label,null,
    case when TG_ARGV[0]='work' then v_id else null end,null,null,
    v_before,v_after,v_changes,jsonb_build_object('table',TG_TABLE_NAME,'operation',TG_OP),v_severity,'CONFIRMED',null,null);
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists products_audit_change on public.products;
create trigger products_audit_change after insert or update on public.products for each row execute function public.audit_row_change('product','id','name','INFO');
drop trigger if exists suppliers_audit_change on public.suppliers;
create trigger suppliers_audit_change after insert or update on public.suppliers for each row execute function public.audit_row_change('supplier','id','business_name','INFO');
drop trigger if exists works_audit_change on public.works;
create trigger works_audit_change after insert or update on public.works for each row execute function public.audit_row_change('work','id','name','INFO');
drop trigger if exists responsibles_audit_change on public.responsibles;
create trigger responsibles_audit_change after insert or update on public.responsibles for each row execute function public.audit_row_change('responsible','id','full_name','INFO');
drop trigger if exists warehouses_audit_change on public.warehouses;
create trigger warehouses_audit_change after insert or update on public.warehouses for each row execute function public.audit_row_change('warehouse','id','name','INFO');
drop trigger if exists profiles_audit_change on public.profiles;
create trigger profiles_audit_change after insert or update on public.profiles for each row execute function public.audit_row_change('user_profile','user_id','full_name','WARNING');

create or replace function public.audit_movement_item_created() returns trigger language plpgsql security definer set search_path=public as $$
declare v_m public.inventory_movements%rowtype; v_product text;
begin
  select * into v_m from public.inventory_movements where id=new.movement_id;
  select name into v_product from public.products where id=new.product_id;
  perform public.audit_write('MOVEMENT_ITEM_ADDED','inventory_movement',new.movement_id,coalesce(v_m.code,'Movimiento'),v_m.destination_location_id,v_m.work_id,null,null,null,to_jsonb(new),null,
    jsonb_build_object('product_id',new.product_id,'product',v_product,'quantity',new.quantity,'unit_cost',new.unit_cost),'INFO','CONFIRMED',null,null);
  return new;
end $$;
drop trigger if exists inventory_movement_items_audit_insert on public.inventory_movement_items;
create trigger inventory_movement_items_audit_insert after insert on public.inventory_movement_items for each row execute function public.audit_movement_item_created();

create or replace function public.audit_create_alert() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.severity in ('WARNING','CRITICAL') then insert into public.audit_alerts(event_id) values(new.id); end if;
  return new;
end $$;
drop trigger if exists audit_event_alert_insert on public.audit_events;
create trigger audit_event_alert_insert after insert on public.audit_events for each row execute function public.audit_create_alert();

revoke insert,delete on public.audit_alerts from authenticated;
grant select,update on public.audit_alerts to authenticated;
drop policy if exists audit_alert_update_management on public.audit_alerts;
create policy audit_alert_update_management on public.audit_alerts for update to authenticated
using(public.current_inventory_role() in ('ADMIN','GERENCIA'))
with check(public.current_inventory_role() in ('ADMIN','GERENCIA'));

create or replace function public.audit_alert_reviewed() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status is distinct from new.status or old.comment is distinct from new.comment or old.assigned_to is distinct from new.assigned_to then
    if new.status in ('RESOLVED','DISMISSED') and new.closed_at is null then new.closed_at:=now(); end if;
    perform public.audit_write('ALERT_REVIEW_UPDATED','audit_alert',new.id,'Alerta de auditoría',null,null,new.comment,null,to_jsonb(old),to_jsonb(new),null,jsonb_build_object('event_id',new.event_id),'INFO','CONFIRMED',null,new.event_id);
  end if;
  return new;
end $$;
drop trigger if exists audit_alert_review_update on public.audit_alerts;
create trigger audit_alert_review_update before update on public.audit_alerts for each row execute function public.audit_alert_reviewed();
