"use client";
import { ContextualHint } from "./onboarding/provider";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { TcIcon } from "./icons";
import { activeCatalogItems, catalogUnit } from "./catalog-inventory";

type Role = "ADMIN" | "GERENCIA" | "DEPOSITO" | "CONSULTA";
export type WorkAction =
  "movement" | "direct_purchase" | "transfer" | "consume" | "return" | "adjust";
type Work = {
  id: string;
  code: string;
  name: string;
  client_name: string;
  address: string | null;
  city: string | null;
  responsible_id: string | null;
  start_date: string | null;
  expected_end_date: string | null;
  status: string;
  notes: string | null;
  active: boolean;
  responsible: { full_name: string; code: string } | null;
};
type Location = { id: string; code: string; name: string };
type Unit = { code: string; allows_decimals: boolean };
type Product = {
  sku: string;
  name: string;
  category: { name: string } | null;
  unit: Unit | null;
};
type Balance = {
  quantity: number;
  product_id: string;
  product: Product | null;
};
type Item = {
  id: string;
  product_id: string;
  quantity: number;
  product: Product | null;
};
type Movement = {
  id: string;
  code: string;
  movement_type: string;
  movement_date: string;
  occurred_at: string;
  created_at: string;
  created_by: string | null;
  source_location_id: string | null;
  destination_location_id: string | null;
  work_id: string | null;
  document_ref: string | null;
  received_by: string | null;
  authorized_by: string | null;
  notes: string | null;
  source_location: {
    name: string;
    code: string;
    location_type: string;
    work_id: string | null;
  } | null;
  destination_location: {
    name: string;
    code: string;
    location_type: string;
    work_id: string | null;
  } | null;
  source: { name: string; code: string } | null;
  destination: { name: string; code: string } | null;
  work: { name: string } | null;
  supplier: { business_name: string } | null;
  items: Item[];
  createdByName?: string;
};
type Tab =
  "summary" | "materials" | "movements" | "purchases" | "used" | "history";

const tabs: { id: Tab; label: string }[] = [
  { id: "summary", label: "Resumen" },
  { id: "materials", label: "Materiales" },
  { id: "movements", label: "Movimientos" },
  { id: "purchases", label: "Compras" },
  { id: "used", label: "Utilizados" },
  { id: "history", label: "Historial" },
];
const statuses: Record<string, string> = {
  PLANIFICACION: "Planificada",
  EN_CURSO: "Activa",
  PAUSADA: "Pausada",
  FINALIZADA: "Finalizada",
  CANCELADA: "Cancelada",
};
const labels: Record<string, string> = {
  COMPRA: "Compra",
  COMPRA_DIRECTA: "Compra directa",
  SALIDA_OBRA: "Entrada desde depósito",
  DEVOLUCION_OBRA: "Devolución",
  CONSUMO: "Consumo / instalación",
  AJUSTE_ENTRADA: "Ajuste positivo",
  AJUSTE_SALIDA: "Ajuste negativo",
  TRANSFERENCIA: "Transferencia",
};

export default function WorkInventoryDetail({
  workId,
  role,
  onBack,
  onAction,
}: {
  workId: string;
  role: Role;
  onBack: () => void;
  onAction: (action: WorkAction, locationId: string) => void;
}) {
  const [work, setWork] = useState<Work | null>(null),
    [location, setLocation] = useState<Location | null>(null),
    [balances, setBalances] = useState<Balance[]>([]),
    [movements, setMovements] = useState<Movement[]>([]);
  const [tab, setTab] = useState<Tab>("summary"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [showZero, setShowZero] = useState(false),
    [typeFilter, setTypeFilter] = useState("all"),
    [dateFrom, setDateFrom] = useState(""),
    [dateTo, setDateTo] = useState(""),
    [userFilter, setUserFilter] = useState(""),
    [routeFilter, setRouteFilter] = useState(""),
    [selected, setSelected] = useState<Movement | null>(null);
  const canPost = role !== "CONSULTA" && work?.status !== "FINALIZADA";

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const workResult = await supabase
        .from("works")
        .select(
          "id,code,name,client_name,address,city,responsible_id,start_date,expected_end_date,status,notes,active,responsible:responsibles(full_name,code)",
        )
        .eq("id", workId)
        .maybeSingle();
      if (!active) return;
      if (workResult.error || !workResult.data) {
        setError("No se encontró la obra o no tienes permiso para verla.");
        setLoading(false);
        return;
      }
      setWork(workResult.data as unknown as Work);
      const locationResult = await supabase
        .from("inventory_locations")
        .select("id,code,name")
        .eq("work_id", workId)
        .eq("location_type", "PROJECT")
        .maybeSingle();
      if (!active) return;
      if (locationResult.error || !locationResult.data) {
        setError(
          "La obra todavía no tiene una ubicación de inventario vinculada.",
        );
        setLoading(false);
        return;
      }
      const loc = locationResult.data as Location;
      setLocation(loc);
      const [b, m] = await Promise.all([
        supabase
          .from("inventory_location_balances")
          .select(
            "quantity,product_id,product:products(sku,name,category:categories(name),unit:units(code,allows_decimals))",
          )
          .eq("location_id", loc.id)
          .order("quantity", { ascending: false }),
        supabase
          .from("inventory_movements")
          .select(
            "id,code,movement_type,movement_date,occurred_at,created_at,created_by,source_location_id,destination_location_id,work_id,document_ref,received_by,authorized_by,notes,source_location:inventory_locations!inventory_movements_source_location_id_fkey(name,code,location_type,work_id),destination_location:inventory_locations!inventory_movements_destination_location_id_fkey(name,code,location_type,work_id),source:warehouses!inventory_movements_source_warehouse_id_fkey(name,code),destination:warehouses!inventory_movements_destination_warehouse_id_fkey(name,code),work:works(name),supplier:suppliers(business_name),items:inventory_movement_items(id,product_id,quantity,product:products(sku,name,category:categories(name),unit:units(code,allows_decimals)))",
          )
          .or(
            `source_location_id.eq.${loc.id},destination_location_id.eq.${loc.id},work_id.eq.${workId}`,
          )
          .order("occurred_at", { ascending: false })
          .limit(500),
      ]);
      if (!active) return;
      if (b.error || m.error) {
        setError("No se pudo cargar la operación completa de esta obra.");
        setLoading(false);
        return;
      }
      const rows = (m.data || []) as unknown as Movement[],
        ids = [
          ...new Set(
            rows
              .map((x) => x.created_by)
              .filter((x): x is string => Boolean(x)),
          ),
        ];
      const p = ids.length
        ? await supabase
            .from("profiles")
            .select("user_id,full_name")
            .in("user_id", ids)
        : null;
      if (!active) return;
      const names = new Map(
        (p?.data || []).map((x) => [x.user_id, x.full_name]),
      );
      setBalances((b.data || []) as unknown as Balance[]);
      setMovements(
        rows.map((x) => ({
          ...x,
          createdByName: names.get(x.created_by || "") || "Usuario registrado",
        })),
      );
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [workId]);

  const stockRows = useMemo(() => {
    const map = new Map<string, Balance>();
    balances.forEach((x) => map.set(x.product_id, x));
    if (showZero) {
      movements
        .flatMap((x) => x.items)
        .forEach((i) => {
          if (i.product && !map.has(i.product_id))
            map.set(i.product_id, {
              product_id: i.product_id,
              quantity: 0,
              product: i.product,
            });
        });
      const operationalCodes = new Set(
        [...map.values()]
          .map((row) => row.product?.sku.toUpperCase())
          .filter((code): code is string => Boolean(code)),
      );
      activeCatalogItems.forEach((item) => {
        if (operationalCodes.has(item.code.toUpperCase())) return;
        map.set(item.catalog_item_id, {
          product_id: item.catalog_item_id,
          quantity: 0,
          product: {
            sku: item.code,
            name: item.name,
            category: { name: item.category },
            unit: catalogUnit(item),
          },
        });
      });
    }
    const q = search.trim().toLowerCase();
    return [...map.values()].filter(
      (x) =>
        (showZero || Number(x.quantity) > 0) &&
        (!q ||
          `${x.product?.sku || ""} ${x.product?.name || ""} ${x.product?.category?.name || ""}`
            .toLowerCase()
            .includes(q)),
    );
  }, [balances, movements, showZero, search]);
  const used = useMemo(
    () =>
      movements.filter(
        (x) =>
          x.movement_type === "CONSUMO" &&
          direction(x, location?.id || "") === "out",
      ),
    [movements, location],
  );
  const purchases = useMemo(
    () =>
      movements.filter(
        (x) =>
          (x.movement_type === "COMPRA" ||
            x.movement_type === "COMPRA_DIRECTA") &&
          direction(x, location?.id || "") === "in",
      ),
    [movements, location],
  );
  const visibleMoves = useMemo(() => {
    const q = search.trim().toLowerCase(),
      u = userFilter.trim().toLowerCase(),
      r = routeFilter.trim().toLowerCase();
    return movements.filter((x) => {
      const day = x.movement_date || x.occurred_at.slice(0, 10),
        text =
          `${x.code} ${x.items.map((i) => `${i.product?.sku || ""} ${i.product?.name || ""}`).join(" ")} ${displayLabel(x, location?.id || "")} ${x.document_ref || ""}`.toLowerCase(),
        route = `${sourceName(x)} ${destinationName(x)}`.toLowerCase();
      return (
        (typeFilter === "all" || x.movement_type === typeFilter) &&
        (!q || text.includes(q)) &&
        (!dateFrom || day >= dateFrom) &&
        (!dateTo || day <= dateTo) &&
        (!u ||
          `${x.createdByName || ""} ${x.received_by || ""} ${x.authorized_by || ""}`
            .toLowerCase()
            .includes(u)) &&
        (!r || route.includes(r))
      );
    });
  }, [
    movements,
    search,
    userFilter,
    routeFilter,
    dateFrom,
    dateTo,
    typeFilter,
    location,
  ]);
  const latestByProduct = useMemo(() => {
    const map = new Map<string, string>();
    movements.forEach((m) =>
      m.items.forEach((i) => {
        if (!map.has(i.product_id))
          map.set(i.product_id, m.occurred_at || m.created_at);
      }),
    );
    return map;
  }, [movements]);
  const usedProductLines = used.flatMap((x) => x.items).length;
  const last = movements[0];

  if (loading)
    return (
      <div className="catalog-loading">
        <div className="spinner" />
        <span>Cargando ficha integral de obra…</span>
      </div>
    );
  if (error && !work)
    return (
      <section className="catalog-workspace">
        <button className="detail-back" onClick={onBack}>
          ← Volver
        </button>
        <p className="error-banner">{error}</p>
      </section>
    );
  if (!work) return null;
  return (
    <section className="catalog-workspace work-hub">
<ContextualHint id="work"/>
      <button className="detail-back" onClick={onBack}>
        ← Volver al punto anterior
      </button>
      <header className="work-hub-head">
        <div>
          <p className="eyebrow">Ficha integral · {work.code}</p>
          <h2>{work.name}</h2>
          <p>
            {work.responsible?.full_name || "Sin responsable"} ·{" "}
            {work.start_date || "Sin fecha de inicio"} ·{" "}
            {[work.address, work.city].filter(Boolean).join(" · ") ||
              "Sin ubicación"}
          </p>
        </div>
        <span className={`work-status ${work.status.toLowerCase()}`}>
          {statuses[work.status] || work.status}
        </span>
      </header>
      {error && <p className="error-banner">{error}</p>}
      <div className="work-actions">
        <button
          disabled={!canPost || !location}
          onClick={() => location && onAction("movement", location.id)}
        >
          <TcIcon name="plus" size={15} />
          Nuevo movimiento
        </button>
        <button
          disabled={!canPost || !location}
          onClick={() => location && onAction("direct_purchase", location.id)}
        >
          Compra directa
        </button>
        <button
          disabled={!canPost || !location}
          onClick={() => location && onAction("transfer", location.id)}
        >
          Transferir
        </button>
        <button
          disabled={!canPost || !location}
          onClick={() => location && onAction("adjust", location.id)}
        >
          Ajustar
        </button>
      </div>
      <div className="work-hub-tabs" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            className={tab === x.id ? "active" : ""}
            onClick={() => {
              setTab(x.id);
              setSearch("");
            }}
          >
            {x.label}
          </button>
        ))}
      </div>
      {tab === "summary" ? (
        <>
          <div className="work-summary-grid">
            <Kpi
              label="Materiales existentes"
              value={balances
                .filter((x) => Number(x.quantity) > 0)
                .length.toString()}
              note="productos con saldo"
            />
            <Kpi
              label="Tipos de unidad"
              value={new Set(
                balances
                  .filter((x) => Number(x.quantity) > 0)
                  .map((x) => x.product?.unit?.code)
                  .filter(Boolean),
              ).size.toString()}
              note="sin sumar UN, KG u otras unidades"
            />
            <Kpi
              label="Registros utilizados"
              value={usedProductLines.toString()}
              note="líneas consumidas / instaladas"
            />
            <Kpi
              label="Movimientos"
              value={movements.length.toString()}
              note={
                last
                  ? `Último: ${dateTime(last.occurred_at || last.created_at)}`
                  : "Sin actividad"
              }
            />
          </div>
          <div className="work-summary-layout">
            <Panel
              title="Últimos movimientos"
              className="work-movements-panel"
              action={
                <button
                  className="work-panel-link"
                  onClick={() => setTab("movements")}
                >
                  Ver historial →
                </button>
              }
            >
              <MovementList
                rows={movements.slice(0, 7)}
                locationId={location?.id || ""}
                onOpen={setSelected}
              />
            </Panel>
            <aside className="work-summary-side">
              <Panel
                title="Materiales con mayor stock"
                action={
                  <button
                    className="work-panel-link"
                    onClick={() => setTab("materials")}
                  >
                    Ver todos →
                  </button>
                }
              >
                <div className="work-top-stock">
                  {balances
                    .filter((x) => Number(x.quantity) > 0)
                    .slice(0, 5)
                    .map((x) => (
                      <div key={x.product_id}>
                        <span>
                          <strong>{x.product?.name}</strong>
                          <small>{x.product?.sku}</small>
                        </span>
                        <b>
                          {qty(x.quantity, x.product?.unit)}{" "}
                          {x.product?.unit?.code}
                        </b>
                      </div>
                    ))}
                </div>
              </Panel>
              <Panel title="Accesos rápidos">
                <div className="work-quick-actions">
                  <button
                    disabled={!canPost || !location}
                    onClick={() =>
                      location && onAction("direct_purchase", location.id)
                    }
                  >
                    Registrar compra directa
                  </button>
                  <button
                    disabled={!canPost || !location}
                    onClick={() => location && onAction("consume", location.id)}
                  >
                    Registrar consumo
                  </button>
                  <button
                    disabled={!canPost || !location}
                    onClick={() => location && onAction("return", location.id)}
                  >
                    Devolver al depósito
                  </button>
                </div>
              </Panel>
            </aside>
          </div>
        </>
      ) : tab === "materials" ? (
        <div className="catalog-card">
          <Toolbar
            value={search}
            setValue={setSearch}
            placeholder={`Buscar material en ${work.name}…`}
            extra={
              <label className="zero-stock-toggle">
                <input
                  type="checkbox"
                  checked={showZero}
                  onChange={(e) => setShowZero(e.target.checked)}
                />
                Mostrar sin stock
              </label>
            }
          />
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Código</th>
                  <th>Categoría</th>
                  <th>Cantidad actual</th>
                  <th>Unidad</th>
                  <th>Último movimiento</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.map((x) => (
                  <tr key={x.product_id}>
                    <td>
                      <strong>{x.product?.name}</strong>
                    </td>
                    <td>
                      <b className="sku">{x.product?.sku}</b>
                    </td>
                    <td>{x.product?.category?.name || "—"}</td>
                    <td>
                      <strong>{qty(x.quantity, x.product?.unit)}</strong>
                    </td>
                    <td>{x.product?.unit?.code}</td>
                    <td>
                      {latestByProduct.get(x.product_id)
                        ? dateTime(latestByProduct.get(x.product_id)!)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!stockRows.length && (
            <Empty text="No hay materiales con esos criterios dentro de esta obra." />
          )}
        </div>
      ) : tab === "movements" ? (
        <div className="catalog-card">
          <MovementFilters
            search={search}
            setSearch={setSearch}
            type={typeFilter}
            setType={setTypeFilter}
            from={dateFrom}
            setFrom={setDateFrom}
            to={dateTo}
            setTo={setDateTo}
            user={userFilter}
            setUser={setUserFilter}
            route={routeFilter}
            setRoute={setRouteFilter}
          />
          <MovementList
            rows={visibleMoves}
            locationId={location?.id || ""}
            onOpen={setSelected}
          />
        </div>
      ) : tab === "purchases" ? (
        <div className="catalog-card">
          <Toolbar
            value={search}
            setValue={setSearch}
            placeholder="Buscar compra, producto, factura o proveedor…"
          />
          <MovementList
            rows={purchases.filter(
              (x) =>
                !search.trim() ||
                `${x.code} ${x.supplier?.business_name || ""} ${x.document_ref || ""} ${x.items.map((i) => i.product?.name).join(" ")}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            )}
            locationId={location?.id || ""}
            onOpen={setSelected}
          />
        </div>
      ) : tab === "used" ? (
        <div className="catalog-card">
          <Toolbar
            value={search}
            setValue={setSearch}
            placeholder="Buscar material utilizado o instalado…"
          />
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad utilizada</th>
                  <th>Unidad</th>
                  <th>Fecha</th>
                  <th>Responsable</th>
                  <th>Movimiento</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {used
                  .flatMap((m) => m.items.map((i) => ({ m, i })))
                  .filter(
                    (x) =>
                      !search.trim() ||
                      `${x.i.product?.name || ""} ${x.i.product?.sku || ""}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map(({ m, i }) => (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.product?.name}</strong>
                        <small>{i.product?.sku}</small>
                      </td>
                      <td>{qty(i.quantity, i.product?.unit)}</td>
                      <td>{i.product?.unit?.code}</td>
                      <td>{dateTime(m.occurred_at || m.created_at)}</td>
                      <td>{m.createdByName}</td>
                      <td>
                        <button
                          className="work-link"
                          onClick={() => setSelected(m)}
                        >
                          {m.code}
                        </button>
                      </td>
                      <td>{m.notes || "Sin observación"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!used.length && (
            <Empty text="Todavía no hay consumos o instalaciones registrados." />
          )}
        </div>
      ) : (
        <div className="catalog-card">
          <div className="audit-intro">
            <strong>Auditoría completa</strong>
            <span>
              Conserva entradas, salidas, consumos, ajustes, documentos,
              responsables y autorizaciones aunque el saldo actual sea cero.
            </span>
          </div>
          <MovementList
            rows={movements}
            locationId={location?.id || ""}
            onOpen={setSelected}
          />
        </div>
      )}
      {selected && (
        <MovementDetail
          movement={selected}
          locationId={location?.id || ""}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

function MovementFilters(p: {
  search: string;
  setSearch: (x: string) => void;
  type: string;
  setType: (x: string) => void;
  from: string;
  setFrom: (x: string) => void;
  to: string;
  setTo: (x: string) => void;
  user: string;
  setUser: (x: string) => void;
  route: string;
  setRoute: (x: string) => void;
}) {
  return (
    <div className="work-filter-grid">
      <input
        value={p.search}
        onChange={(e) => p.setSearch(e.target.value)}
        placeholder="Producto o movimiento…"
      />
      <select value={p.type} onChange={(e) => p.setType(e.target.value)}>
        <option value="all">Todos los tipos</option>
        {Object.entries(labels).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={p.from}
        onChange={(e) => p.setFrom(e.target.value)}
        aria-label="Desde"
      />
      <input
        type="date"
        value={p.to}
        onChange={(e) => p.setTo(e.target.value)}
        aria-label="Hasta"
      />
      <input
        value={p.user}
        onChange={(e) => p.setUser(e.target.value)}
        placeholder="Responsable o autorizante…"
      />
      <input
        value={p.route}
        onChange={(e) => p.setRoute(e.target.value)}
        placeholder="Origen o destino…"
      />
    </div>
  );
}
function Toolbar({
  value,
  setValue,
  placeholder,
  extra,
}: {
  value: string;
  setValue: (x: string) => void;
  placeholder: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="catalog-toolbar work-toolbar">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
      />
      {extra}
    </div>
  );
}
function MovementList({
  rows,
  locationId,
  onOpen,
}: {
  rows: Movement[];
  locationId: string;
  onOpen: (x: Movement) => void;
}) {
  return (
    <div className="work-movement-list">
      {rows.map((m) => {
        const dir = direction(m, locationId);
        const shownItems = m.items.length >= 5 ? m.items.slice(0, 3) : m.items;
        return (
          <button
            key={m.id}
            className="work-movement-row"
            onClick={() => onOpen(m)}
            aria-label={`Abrir detalle de ${displayLabel(m, locationId)} ${m.code}`}
          >
            <span className={`movement-direction ${dir}`}>
              <TcIcon name={dir === "in" ? "plus" : "movements"} size={15} />
            </span>
            <span className="movement-main">
              <strong>{displayLabel(m, locationId)}</strong>
              <small>{m.code}</small>
            </span>
            <span className="movement-route">
              <strong>
                {sourceName(m)} → {destinationName(m)}
              </strong>
            </span>
            <time
              className="movement-time"
              dateTime={m.occurred_at || m.created_at}
            >
              {dateTime(m.occurred_at || m.created_at)}
            </time>
            <span
              className="movement-materials-inline"
              aria-label="Materiales y cantidades"
            >
              {shownItems.map((i) => (
                <span key={i.id} className="movement-material-inline">
                  <strong>{i.product?.name || "Producto"}</strong>
                  <b className={dir === "in" ? "qty-in" : "qty-out"}>
                    {dir === "in" ? "+" : "−"}
                    {qty(i.quantity, i.product?.unit)}{" "}
                    {i.product?.unit?.code || ""}
                  </b>
                </span>
              ))}
              {m.items.length >= 5 && (
                <span className="movement-more">
                  +{m.items.length - 3} materiales
                </span>
              )}
            </span>
            <TcIcon name="arrow-right" size={14} />
          </button>
        );
      })}
      {!rows.length && <Empty text="No hay registros para mostrar." />}
    </div>
  );
}
function MovementDetail({
  movement,
  locationId,
  onClose,
}: {
  movement: Movement;
  locationId: string;
  onClose: () => void;
}) {
  const dir = direction(movement, locationId);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="catalog-modal movement-detail-modal"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-title">
          <div>
            <p className="eyebrow">Auditoría del movimiento</p>
            <h3>{movement.code}</h3>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="movement-detail-summary">
          <Info label="Tipo" value={displayLabel(movement, locationId)} />
          <Info
            label="Fecha y hora"
            value={dateTime(movement.occurred_at || movement.created_at)}
          />
          <Info label="Origen" value={sourceName(movement)} />
          <Info label="Destino" value={destinationName(movement)} />
          <Info
            label="Creado por"
            value={movement.createdByName || "Usuario registrado"}
          />
          <Info
            label="Recibió"
            value={movement.received_by || "Sin registrar"}
          />
          <Info
            label="Autorizó"
            value={movement.authorized_by || "Sin registrar"}
          />
          <Info
            label="Documento"
            value={movement.document_ref || "Sin documento"}
          />
        </div>
        <div className="movement-detail-products">
          <h4>Productos vinculados a esta obra</h4>
          {movement.items.map((i) => (
            <div key={i.id}>
              <span>
                <strong>{i.product?.name}</strong>
                <small>{i.product?.sku}</small>
              </span>
              <b className={dir === "in" ? "qty-in" : "qty-out"}>
                {dir === "in" ? "+" : "−"}
                {qty(i.quantity, i.product?.unit)} {i.product?.unit?.code}
              </b>
            </div>
          ))}
        </div>
        <div className="movement-detail-notes">
          <span>Observaciones / motivo</span>
          <p>{movement.notes || "Sin observaciones registradas."}</p>
        </div>
      </section>
    </div>
  );
}
function Panel({
  title,
  children,
  action,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={`work-summary-panel ${className}`}>
      <header className="work-panel-head">
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </article>
  );
}
function Kpi({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article>
      <span>{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </article>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="catalog-empty">
      <strong>Sin registros</strong>
      <span>{text}</span>
    </div>
  );
}
function direction(m: Movement, locationId: string): "in" | "out" {
  if (m.destination_location_id === locationId) return "in";
  if (m.source_location_id === locationId) return "out";
  return m.movement_type === "DEVOLUCION_OBRA" ||
    m.movement_type === "CONSUMO" ||
    m.movement_type === "AJUSTE_SALIDA"
    ? "out"
    : "in";
}
function sourceName(m: Movement) {
  return (
    m.source_location?.name ||
    m.source?.name ||
    (m.movement_type === "DEVOLUCION_OBRA" ? m.work?.name : null) ||
    m.supplier?.business_name ||
    "Entrada externa"
  );
}
function destinationName(m: Movement) {
  return (
    m.destination_location?.name ||
    m.destination?.name ||
    (m.movement_type === "SALIDA_OBRA" ? m.work?.name : null) ||
    (m.movement_type === "CONSUMO" ? "Consumido / instalado" : "Salida externa")
  );
}
function displayLabel(m: Movement, locationId: string) {
  if (
    (m.movement_type === "COMPRA" || m.movement_type === "COMPRA_DIRECTA") &&
    direction(m, locationId) === "in"
  )
    return "Compra directa";
  return labels[m.movement_type] || m.movement_type;
}
function qty(v: number, u?: Unit | null) {
  const integerUnit =
    u?.allows_decimals === false || u?.code?.toUpperCase() === "UN";
  return fmt(v, integerUnit ? 0 : 3);
}
function fmt(v: number, d = 0) {
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: d }).format(
    Number(v) || 0,
  );
}
function dateTime(v: string) {
  return v
    ? new Intl.DateTimeFormat("es-PY", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(v))
    : "Sin fecha";
}
