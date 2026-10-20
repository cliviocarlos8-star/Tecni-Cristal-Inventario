"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { IconName, TcIcon } from "./icons";
import {
  countPositiveStocks,
  formatInventoryQuantity,
  INVENTORY_MOVEMENT_LABELS,
  movementFlow,
  requiresReplenishment,
  summarizeMovementQuantity,
} from "./inventory-format";
import { openMovementDetail } from "./movement-detail";

type Product = {
  id: string;
  sku: string;
  name: string;
  min_stock: number;
  unit: { code: string; allows_decimals?: boolean | null } | null;
};
type Balance = {
  product_id: string;
  location_id: string;
  quantity: number;
  location: {
    name: string;
    code: string;
    location_type: "WORKSHOP" | "PROJECT";
    warehouse_id: string | null;
    work_id: string | null;
  } | null;
};
type Work = { id: string; code: string; name: string; status: string };
type Movement = {
  id: string;
  code: string;
  movement_type: string;
  movement_date: string;
  occurred_at: string;
  created_at: string;
  source: { name: string } | null;
  destination: { name: string } | null;
  source_location: { name: string } | null;
  destination_location: { name: string } | null;
  work: { id: string; name: string } | null;
  items: {
    quantity: number;
    product: { unit: { code: string; allows_decimals?: boolean | null } | null } | null;
  }[];
};
type Warehouse = { id: string };
type ProductStock = Product & { quantity: number };

export default function DashboardModule({
  onNavigate,
  onOpenWork,
}: {
  onNavigate: (section: string) => void;
  onOpenWork: (workId: string) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]),
    [balances, setBalances] = useState<Balance[]>([]),
    [works, setWorks] = useState<Work[]>([]),
    [movements, setMovements] = useState<Movement[]>([]),
    [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const results = await Promise.all([
        supabase
          .from("products")
          .select("id,sku,name,min_stock,unit:units(code,allows_decimals)")
          .eq("active", true)
          .order("name"),
        supabase
          .from("inventory_location_balances")
          .select(
            "product_id,location_id,quantity,location:inventory_locations(name,code,location_type,warehouse_id,work_id)",
          ),
        supabase
          .from("works")
          .select("id,code,name,status")
          .eq("active", true)
          .in("status", ["PLANIFICACION", "EN_CURSO", "PAUSADA"])
          .order("name"),
        supabase
          .from("inventory_movements")
          .select(
            "id,code,movement_type,movement_date,occurred_at,created_at,source_location:inventory_locations!inventory_movements_source_location_id_fkey(name),destination_location:inventory_locations!inventory_movements_destination_location_id_fkey(name),source:warehouses!inventory_movements_source_warehouse_id_fkey(name),destination:warehouses!inventory_movements_destination_warehouse_id_fkey(name),work:works(id,name),items:inventory_movement_items(quantity,product:products(unit:units(code,allows_decimals)))",
          )
          .order("occurred_at", { ascending: false })
          .limit(7),
        supabase.from("warehouses").select("id").eq("active", true),
      ]);
      const problem = results.find((result) => result.error)?.error;
      if (problem) setError("No se pudo cargar el resumen operativo.");
      else {
        setProducts((results[0].data || []) as unknown as Product[]);
        setBalances((results[1].data || []) as unknown as Balance[]);
        setWorks((results[2].data || []) as Work[]);
        setMovements((results[3].data || []) as unknown as Movement[]);
        setWarehouses((results[4].data || []) as Warehouse[]);
      }
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const productStocks = useMemo<ProductStock[]>(
    () =>
      products.map((product) => ({
        ...product,
        quantity: balances
          .filter((balance) => balance.product_id === product.id)
          .reduce((sum, balance) => sum + Number(balance.quantity), 0),
      })),
    [products, balances],
  );
  const attention = productStocks
    .filter((item) => requiresReplenishment(item.quantity, item.min_stock))
    .sort(
      (a, b) =>
        severity(a) - severity(b) ||
        Number(b.min_stock) - b.quantity - (Number(a.min_stock) - a.quantity),
    );
  const depotStock = countPositiveStocks(
    balances.filter((item) => item.location?.location_type === "WORKSHOP"),
  );
  const projectStock = countPositiveStocks(
      balances.filter((item) => item.location?.location_type === "PROJECT"),
    ),
    activeWorks = works.filter((item) => item.status === "EN_CURSO").length;
  const warehouseTotals = useMemo(() => {
    const grouped = new Map<string, { name: string; products: number }>();
    balances
      .filter((item) => item.location?.location_type === "WORKSHOP")
      .forEach((item) => {
        const key = item.location_id,
          current = grouped.get(key) || {
            name: item.location?.name || "Depósito",
            products: 0,
          };
        if (Number(item.quantity) > 0) current.products += 1;
        grouped.set(key, current);
      });
    return Array.from(grouped.values()).sort((a, b) => b.products - a.products);
  }, [balances]);
  const maxWarehouse = Math.max(
    ...warehouseTotals.map((item) => item.products),
    1,
  );
  const workTotals = useMemo(
    () =>
      works
        .map((work) => ({
          ...work,
          products: countPositiveStocks(
            balances.filter((item) => item.location?.work_id === work.id),
          ),
        }))
        .sort((a, b) => b.products - a.products),
    [works, balances],
  );

  if (loading)
    return (
      <div className="dashboard-loading" aria-live="polite">
        <div className="dashboard-skeleton">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <span>Cargando resumen operativo…</span>
      </div>
    );
  return (
    <section className="dashboard">
      {error && <p className="error-banner">{error}</p>}
      <div className="dashboard-kpis">
        <Kpi
          icon="active-products"
          label="Productos activos"
          value={formatNumber(products.length)}
          note="Catálogo maestro"
          onClick={() => onNavigate("Productos")}
        />
        <Kpi
          icon="warehouse"
          label="Stock en depósitos"
          value={formatNumber(depotStock)}
          note="productos con saldo · sin obras"
          onClick={() => onNavigate("Movimientos")}
        />
        <Kpi
          icon="works"
          label="Stock en obras"
          value={formatNumber(projectStock)}
          note="productos por ubicación · sin depósitos"
          onClick={() => onNavigate("Movimientos")}
        />
        <Kpi
          icon="alert"
          label="Stock bajo"
          value={formatNumber(attention.length)}
          note="Incluye productos sin stock"
          tone={attention.length ? "warning" : ""}
          onClick={() => onNavigate("Alertas")}
        />
        <Kpi
          icon="works"
          label="Obras activas"
          value={formatNumber(activeWorks)}
          note={`${works.length} en seguimiento`}
          onClick={() => onNavigate("Obras")}
        />
      </div>
      <div className="dashboard-grid">
        <article className="dashboard-card stock-priority">
          <CardTitle
            eyebrow="Prioridad operativa"
            title="Requiere atención"
            action="Ver inventario →"
            onClick={() => onNavigate("Productos")}
          />
          {attention.length ? (
            <div className="stock-table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Actual</th>
                    <th>Mínimo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {attention.slice(0, 6).map((item) => {
                    const state = stockState(item);
                    return (
                      <tr key={item.id} onClick={() => onNavigate("Productos")}>
                        <td>
                          <strong>{item.sku}</strong>
                        </td>
                        <td>{item.name}</td>
                        <td>
                          {formatInventoryQuantity(item.quantity, item.unit)} {item.unit?.code || ""}
                        </td>
                        <td>{formatInventoryQuantity(item.min_stock, item.unit)}</td>
                        <td>
                          <span className={`stock-badge ${state.className}`}>
                            {state.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dashboard-ok">
              <b>✓</b>
              <strong>Inventario dentro de los niveles establecidos</strong>
              <span>No hay productos que requieran reposición.</span>
            </div>
          )}
        </article>
        <aside className="dashboard-card active-works">
          <CardTitle
            eyebrow="Material comprometido"
            title="Obras activas"
            action="Ver obras →"
            onClick={() => onNavigate("Obras")}
          />
          {workTotals.length ? (
            <div className="works-list">
              {workTotals.slice(0, 5).map((work) => (
                <button key={work.id} onClick={() => onOpenWork(work.id)}>
                  <span>
                    <strong>{work.name}</strong>
                    <small>
                      {work.code} · {workStatus(work.status)}
                    </small>
                  </span>
                  <b>
                    {formatNumber(work.products)}
                    <small> productos</small>
                  </b>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Sin obras activas"
              text="Las obras en planificación o ejecución aparecerán aquí."
            />
          )}
        </aside>
        <article className="dashboard-card dashboard-activity">
          <CardTitle
            eyebrow="Actividad reciente"
            title="Últimos movimientos"
            action="Ver todos →"
            onClick={() => onNavigate("Movimientos")}
          />
          {movements.length ? (
            <div className="activity-table-wrap">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Movimiento</th>
                    <th>Tipo</th>
                    <th>Cantidad / detalle</th>
                    <th>Origen / destino</th>
                    <th>Fecha / hora</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((item) => {
                    const out = isOutgoing(item.movement_type);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => openMovementDetail(item.id)}
                        className="movement-clickable-row"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") openMovementDetail(item.id);
                        }}
                      >
                        <td>
                          <button type="button" className="movement-code-link" onClick={(event) => { event.stopPropagation(); openMovementDetail(item.id); }}>{item.code}</button>
                        </td>
                        <td>
                          <span className={`type-badge ${out ? "out" : "in"}`}>
                            {INVENTORY_MOVEMENT_LABELS[item.movement_type] ||
                              item.movement_type}
                          </span>
                        </td>
                        <td>
                          <b className={out ? "qty-out" : "qty-in"}>
                            {item.items.length === 1 ? (out ? "−" : "+") : ""}
                            {summarizeMovementQuantity(item.items)}
                          </b>
                        </td>
                        <td>
                          {item.work ? (
                            <button type="button" className="work-context-link" onClick={(event) => { event.stopPropagation(); onOpenWork(item.work!.id); }}>
                              {movementRoute(item)}
                            </button>
                          ) : movementRoute(item)}
                        </td>
                        <td>
                          {formatDateTime(item.occurred_at || item.created_at, item.movement_date)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Todavía no se registraron movimientos"
              text="La actividad aparecerá después del primer ingreso o salida."
            />
          )}
        </article>
        <article className="dashboard-card warehouse-card">
          <CardTitle
            eyebrow="Distribución"
            title="Stock por depósito"
            action={`${warehouses.length} depósitos →`}
            onClick={() => onNavigate("Depósitos")}
          />
          {warehouseTotals.length ? (
            <div className="warehouse-bars">
              {warehouseTotals.map((item) => {
                const percent =
                  depotStock > 0 ? (item.products / depotStock) * 100 : 0;
                return (
                  <div key={item.name}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        <b>{formatNumber(item.products)} productos</b> ·{" "}
                        {Math.round(percent)}%
                      </span>
                    </div>
                    <i>
                      <b
                        style={{
                          width: `${Math.max(3, (item.products / maxWarehouse) * 100)}%`,
                        }}
                      />
                    </i>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Sin existencias registradas"
              text="La distribución aparecerá después de una entrada."
            />
          )}
        </article>
        <aside className="dashboard-card operational-summary">
          <CardTitle eyebrow="Hoy" title="Actividad operativa" />
          <div className="operational-list">
            <button onClick={() => onNavigate("Alertas")}>
              <i className="warn">
                <TcIcon name="alert" size={16} />
              </i>
              <span>
                <b>{attention.length}</b> productos por reponer
              </span>
              <em>
                <TcIcon name="arrow-right" size={15} />
              </em>
            </button>
            <button onClick={() => onNavigate("Movimientos")}>
              <i>
                <TcIcon name="movements" size={16} />
              </i>
              <span>
                <b>{movements.length}</b> movimientos recientes
              </span>
              <em>
                <TcIcon name="arrow-right" size={15} />
              </em>
            </button>
            <button onClick={() => onNavigate("Obras")}>
              <i>
                <TcIcon name="works" size={16} />
              </i>
              <span>
                <b>{activeWorks}</b> obras en ejecución
              </span>
              <em>
                <TcIcon name="arrow-right" size={15} />
              </em>
            </button>
          </div>
          <div className="quick-inline">
            <button onClick={() => onNavigate("Movimientos")}>
              + Movimiento
            </button>
            <button onClick={() => onNavigate("Productos")}>+ Producto</button>
            <button onClick={() => onNavigate("Obras")}>+ Obra</button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  note,
  tone = "",
  onClick,
}: {
  icon: IconName;
  label: string;
  value: string;
  note: string;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button className={tone} onClick={onClick}>
      <i>
        <TcIcon name={icon} size={19} />
      </i>
      <span>{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </button>
  );
}
function CardTitle({
  eyebrow,
  title,
  action,
  onClick,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="dashboard-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action && <button onClick={onClick}>{action}</button>}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="dashboard-empty">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
function severity(item: ProductStock) {
  return item.quantity <= 0
    ? 0
    : item.quantity <= Math.max(1, Number(item.min_stock) * 0.5)
      ? 1
      : 2;
}
function stockState(item: ProductStock) {
  if (item.quantity <= 0) return { label: "SIN STOCK", className: "sin-stock" };
  if (item.quantity <= Math.max(1, Number(item.min_stock) * 0.5))
    return { label: "CRÍTICO", className: "critical" };
  return { label: "BAJO", className: "low" };
}
function isOutgoing(type: string) {
  return movementFlow(type) === "out";
}
function movementRoute(item: Movement) {
  const source = item.source_location?.name || item.source?.name;
  const destination = item.destination_location?.name || item.destination?.name;
  if (item.movement_type === "COMPRA_DIRECTA")
    return item.work?.name || destination || "Obra sin identificar";
  if (item.movement_type === "TRANSFERENCIA")
    return `${source || "Origen"} → ${destination || "Destino"}`;
  if (item.movement_type === "SALIDA_OBRA")
    return `${source || "Depósito"} → ${item.work?.name || destination || "Obra"}`;
  if (item.movement_type === "DEVOLUCION_OBRA")
    return `${item.work?.name || source || "Obra"} → ${destination || "Depósito"}`;
  if (item.movement_type === "CONSUMO")
    return `${source || item.work?.name || "Obra"} → Consumido / instalado`;
  return item.work?.name || destination || source || "Movimiento externo";
}
function workStatus(status: string) {
  return status === "EN_CURSO"
    ? "En curso"
    : status === "PLANIFICACION"
      ? "Planificación"
      : "Pausada";
}
function formatDateTime(createdAt: string, fallback: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
function formatNumber(value: number) {
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(
    Number(value) || 0,
  );
}
