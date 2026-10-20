-- Tecni Cristal Inventario — Fase 3: movimientos y existencias.
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  movement_type text not null check (movement_type in (
    'COMPRA','SALIDA_OBRA','DEVOLUCION_OBRA','AJUSTE_ENTRADA','AJUSTE_SALIDA','TRANSFERENCIA'
  )),
  movement_date date not null default current_date,
  source_warehouse_id uuid references public.warehouses(id) on delete restrict,
  destination_warehouse_id uuid references public.warehouses(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  work_id uuid references public.works(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid()
);

create table public.inventory_movement_items (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) check (unit_cost is null or unit_cost >= 0),
  unique (movement_id, product_id)
);

create table public.inventory_balances (
  product_id uuid not null references public.products(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, warehouse_id)
);

create index inventory_movements_date_idx on public.inventory_movements (movement_date desc, created_at desc);
create index inventory_movement_items_product_idx on public.inventory_movement_items (product_id);
create index inventory_balances_warehouse_idx on public.inventory_balances (warehouse_id, product_id);

alter table public.inventory_movements enable row level security;
alter table public.inventory_movement_items enable row level security;
alter table public.inventory_balances enable row level security;

create policy "inventory_movements_authenticated_read" on public.inventory_movements for select to authenticated
using (public.current_app_role() is not null);
create policy "inventory_movement_items_authenticated_read" on public.inventory_movement_items for select to authenticated
using (public.current_app_role() is not null);
create policy "inventory_balances_authenticated_read" on public.inventory_balances for select to authenticated
using (public.current_app_role() is not null);

create or replace function public.post_inventory_movement(
  p_code text,
  p_movement_type text,
  p_movement_date date,
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_supplier_id uuid,
  p_work_id uuid,
  p_notes text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_movement_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14,3);
  v_unit_cost numeric(14,2);
  v_current numeric(14,3);
begin
  if auth.uid() is null or public.current_app_role() not in ('ADMIN','GERENCIA','DEPOSITO') then
    raise exception 'No tienes permiso para registrar movimientos.';
  end if;
  if p_movement_type not in ('COMPRA','SALIDA_OBRA','DEVOLUCION_OBRA','AJUSTE_ENTRADA','AJUSTE_SALIDA','TRANSFERENCIA') then
    raise exception 'Tipo de movimiento inválido.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Agrega al menos un producto.';
  end if;
  if p_movement_type in ('SALIDA_OBRA','AJUSTE_SALIDA','TRANSFERENCIA') and p_source_warehouse_id is null then
    raise exception 'Selecciona el depósito de origen.';
  end if;
  if p_movement_type in ('COMPRA','DEVOLUCION_OBRA','AJUSTE_ENTRADA','TRANSFERENCIA') and p_destination_warehouse_id is null then
    raise exception 'Selecciona el depósito de destino.';
  end if;
  if p_movement_type='TRANSFERENCIA' and p_source_warehouse_id=p_destination_warehouse_id then
    raise exception 'El origen y el destino deben ser diferentes.';
  end if;
  if p_movement_type in ('SALIDA_OBRA','DEVOLUCION_OBRA') and p_work_id is null then
    raise exception 'Selecciona una obra.';
  end if;

  insert into public.inventory_movements(code,movement_type,movement_date,source_warehouse_id,destination_warehouse_id,supplier_id,work_id,notes,created_by)
  values(upper(trim(p_code)),p_movement_type,coalesce(p_movement_date,current_date),p_source_warehouse_id,p_destination_warehouse_id,p_supplier_id,p_work_id,nullif(trim(p_notes),''),auth.uid())
  returning id into v_movement_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_cost := nullif(v_item->>'unit_cost','')::numeric;
    if v_product_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Producto o cantidad inválida.';
    end if;

    insert into public.inventory_movement_items(movement_id,product_id,quantity,unit_cost)
    values(v_movement_id,v_product_id,v_quantity,v_unit_cost);

    if p_movement_type in ('SALIDA_OBRA','AJUSTE_SALIDA','TRANSFERENCIA') then
      select quantity into v_current from public.inventory_balances
      where product_id=v_product_id and warehouse_id=p_source_warehouse_id for update;
      if coalesce(v_current,0) < v_quantity then
        raise exception 'Stock insuficiente para uno de los productos.';
      end if;
      update public.inventory_balances set quantity=quantity-v_quantity,updated_at=now()
      where product_id=v_product_id and warehouse_id=p_source_warehouse_id;
    end if;

    if p_movement_type in ('COMPRA','DEVOLUCION_OBRA','AJUSTE_ENTRADA','TRANSFERENCIA') then
      insert into public.inventory_balances(product_id,warehouse_id,quantity)
      values(v_product_id,p_destination_warehouse_id,v_quantity)
      on conflict(product_id,warehouse_id) do update
      set quantity=public.inventory_balances.quantity+excluded.quantity,updated_at=now();
    end if;
  end loop;
  return v_movement_id;
end;
$$;

revoke all on function public.post_inventory_movement(text,text,date,uuid,uuid,uuid,uuid,text,jsonb) from public;
grant execute on function public.post_inventory_movement(text,text,date,uuid,uuid,uuid,uuid,text,jsonb) to authenticated;
