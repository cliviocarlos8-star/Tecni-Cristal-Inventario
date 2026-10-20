-- Tecni Cristal Inventario: stock real por deposito u obra y movimientos directos.
create table public.inventory_locations(
 id uuid primary key default gen_random_uuid(),code text not null unique,name text not null,
 location_type text not null check(location_type in('WORKSHOP','PROJECT')),
 warehouse_id uuid unique references public.warehouses(id) on delete restrict,
 work_id uuid unique references public.works(id) on delete restrict,active boolean not null default true,
 created_at timestamptz not null default now(),
 check((location_type='WORKSHOP' and warehouse_id is not null and work_id is null)or(location_type='PROJECT' and work_id is not null and warehouse_id is null))
);
insert into public.inventory_locations(code,name,location_type,warehouse_id,active)
select 'DEP-'||code,name,'WORKSHOP',id,active from public.warehouses on conflict(warehouse_id)do nothing;
insert into public.inventory_locations(code,name,location_type,work_id,active)
select 'OBR-'||code,name,'PROJECT',id,active from public.works on conflict(work_id)do nothing;

create table public.inventory_location_balances(
 product_id uuid not null references public.products(id) on delete restrict,
 location_id uuid not null references public.inventory_locations(id) on delete restrict,
 quantity numeric(14,3) not null default 0 check(quantity>=0),updated_at timestamptz not null default now(),
 primary key(product_id,location_id)
);
insert into public.inventory_location_balances(product_id,location_id,quantity,updated_at)
select b.product_id,l.id,b.quantity,b.updated_at from public.inventory_balances b join public.inventory_locations l on l.warehouse_id=b.warehouse_id;

alter table public.inventory_movements drop constraint inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check check(movement_type in('COMPRA','COMPRA_DIRECTA','SALIDA_OBRA','DEVOLUCION_OBRA','CONSUMO','AJUSTE_ENTRADA','AJUSTE_SALIDA','TRANSFERENCIA'));
alter table public.inventory_movements
 add column source_location_id uuid references public.inventory_locations(id) on delete restrict,
 add column destination_location_id uuid references public.inventory_locations(id) on delete restrict,
 add column document_ref text,add column received_by text,add column authorized_by text,
 add column occurred_at timestamptz not null default now(),
 add column reversed_movement_id uuid references public.inventory_movements(id) on delete restrict;
update public.inventory_movements m set source_location_id=(select id from public.inventory_locations where warehouse_id=m.source_warehouse_id),destination_location_id=(select id from public.inventory_locations where warehouse_id=m.destination_warehouse_id),occurred_at=coalesce(m.created_at,m.movement_date::timestamptz);
create index inventory_location_balances_location_idx on public.inventory_location_balances(location_id,product_id);
create index inventory_movements_source_location_idx on public.inventory_movements(source_location_id);
create index inventory_movements_destination_location_idx on public.inventory_movements(destination_location_id);
alter table public.inventory_locations enable row level security;
alter table public.inventory_location_balances enable row level security;
create policy "inventory_locations_authenticated_read" on public.inventory_locations for select to authenticated using(public.current_app_role() is not null);
create policy "inventory_location_balances_authenticated_read" on public.inventory_location_balances for select to authenticated using(public.current_app_role() is not null);

create or replace function public.sync_inventory_location()returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='warehouses' then insert into public.inventory_locations(code,name,location_type,warehouse_id,active)values('DEP-'||new.code,new.name,'WORKSHOP',new.id,new.active)on conflict(warehouse_id)do update set code=excluded.code,name=excluded.name,active=excluded.active;
 else insert into public.inventory_locations(code,name,location_type,work_id,active)values('OBR-'||new.code,new.name,'PROJECT',new.id,new.active)on conflict(work_id)do update set code=excluded.code,name=excluded.name,active=excluded.active;end if;return new;
end$$;
create trigger warehouses_sync_inventory_location after insert or update of code,name,active on public.warehouses for each row execute function public.sync_inventory_location();
create trigger works_sync_inventory_location after insert or update of code,name,active on public.works for each row execute function public.sync_inventory_location();

create or replace function public.prevent_work_close_with_stock()returns trigger language plpgsql security definer set search_path=public as $$
begin if(new.active=false or new.status in('FINALIZADA','CANCELADA'))and(old.active is distinct from new.active or old.status is distinct from new.status)and exists(select 1 from public.inventory_locations l join public.inventory_location_balances b on b.location_id=l.id where l.work_id=new.id and b.quantity>0)then raise exception 'La obra mantiene existencias. Transfiere, devuelve o consume el stock antes de cerrarla.';end if;return new;end$$;
create trigger works_prevent_close_with_stock before update of status,active on public.works for each row execute function public.prevent_work_close_with_stock();

create or replace function public.post_location_inventory_movement(
 p_code text,p_movement_type text,p_occurred_at timestamptz,p_source_location_id uuid,p_destination_location_id uuid,p_supplier_id uuid,p_document_ref text,p_received_by text,p_authorized_by text,p_notes text,p_items jsonb
)returns uuid language plpgsql security definer set search_path=public as $$
declare mid uuid;i jsonb;pid uuid;q numeric(14,3);cost numeric(14,2);current_q numeric(14,3);kind text:=upper(trim(p_movement_type));src public.inventory_locations%rowtype;dst public.inventory_locations%rowtype;wid uuid;
begin
 if auth.uid() is null or public.current_app_role() not in('ADMIN','GERENCIA','DEPOSITO')then raise exception 'No tienes permiso para registrar movimientos.';end if;
 if kind not in('COMPRA','CONSUMO','AJUSTE_ENTRADA','AJUSTE_SALIDA','TRANSFERENCIA')then raise exception 'Tipo de movimiento invalido.';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Agrega al menos un producto.';end if;
 if p_source_location_id is not null then select * into src from public.inventory_locations where id=p_source_location_id and active=true;if not found then raise exception 'La ubicacion de origen no esta activa.';end if;end if;
 if p_destination_location_id is not null then select * into dst from public.inventory_locations where id=p_destination_location_id and active=true;if not found then raise exception 'La ubicacion de destino no esta activa.';end if;if dst.location_type='PROJECT' and not exists(select 1 from public.works where id=dst.work_id and active=true and status in('PLANIFICACION','EN_CURSO','PAUSADA'))then raise exception 'La obra de destino no admite movimientos.';end if;end if;
 if kind='COMPRA' then if p_source_location_id is not null or p_destination_location_id is null or p_supplier_id is null then raise exception 'La compra requiere proveedor y destino.';end if;if dst.location_type='PROJECT'then kind:='COMPRA_DIRECTA';end if;
 elsif kind='TRANSFERENCIA'then if p_source_location_id is null or p_destination_location_id is null or p_source_location_id=p_destination_location_id then raise exception 'Selecciona origen y destino diferentes.';end if;
 elsif kind='CONSUMO'then if p_source_location_id is null or p_destination_location_id is not null or src.location_type<>'PROJECT'then raise exception 'El consumo debe salir de una obra.';end if;
 elsif kind='AJUSTE_ENTRADA'then if p_source_location_id is not null or p_destination_location_id is null or nullif(trim(p_notes),'')is null then raise exception 'El ajuste requiere destino y motivo.';end if;
 elsif kind='AJUSTE_SALIDA'then if p_source_location_id is null or p_destination_location_id is not null or nullif(trim(p_notes),'')is null then raise exception 'El ajuste requiere origen y motivo.';end if;end if;
 wid:=coalesce(dst.work_id,src.work_id);
 insert into public.inventory_movements(code,movement_type,movement_date,occurred_at,source_location_id,destination_location_id,source_warehouse_id,destination_warehouse_id,supplier_id,work_id,document_ref,received_by,authorized_by,notes,created_by)
 values(upper(trim(p_code)),kind,coalesce(p_occurred_at,now())::date,coalesce(p_occurred_at,now()),p_source_location_id,p_destination_location_id,src.warehouse_id,dst.warehouse_id,p_supplier_id,wid,nullif(trim(p_document_ref),''),nullif(trim(p_received_by),''),nullif(trim(p_authorized_by),''),nullif(trim(p_notes),''),auth.uid())returning id into mid;
 for i in select value from jsonb_array_elements(p_items)loop pid:=(i->>'product_id')::uuid;q:=(i->>'quantity')::numeric;cost:=nullif(i->>'unit_cost','')::numeric;if pid is null or q is null or q<=0 then raise exception 'Producto o cantidad invalida.';end if;
  insert into public.inventory_movement_items(movement_id,product_id,quantity,unit_cost)values(mid,pid,q,cost);
  if p_source_location_id is not null then select quantity into current_q from public.inventory_location_balances where product_id=pid and location_id=p_source_location_id for update;if coalesce(current_q,0)<q then raise exception 'Stock insuficiente para uno de los productos.';end if;update public.inventory_location_balances set quantity=quantity-q,updated_at=now()where product_id=pid and location_id=p_source_location_id;if src.warehouse_id is not null then update public.inventory_balances set quantity=quantity-q,updated_at=now()where product_id=pid and warehouse_id=src.warehouse_id;end if;end if;
  if p_destination_location_id is not null then insert into public.inventory_location_balances(product_id,location_id,quantity)values(pid,p_destination_location_id,q)on conflict(product_id,location_id)do update set quantity=public.inventory_location_balances.quantity+excluded.quantity,updated_at=now();if dst.warehouse_id is not null then insert into public.inventory_balances(product_id,warehouse_id,quantity)values(pid,dst.warehouse_id,q)on conflict(product_id,warehouse_id)do update set quantity=public.inventory_balances.quantity+excluded.quantity,updated_at=now();end if;end if;
 end loop;return mid;
end$$;
revoke all on function public.post_location_inventory_movement(text,text,timestamptz,uuid,uuid,uuid,text,text,text,text,jsonb)from public;
grant execute on function public.post_location_inventory_movement(text,text,timestamptz,uuid,uuid,uuid,text,text,text,text,jsonb)to authenticated;
