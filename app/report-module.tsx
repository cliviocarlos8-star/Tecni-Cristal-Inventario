"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { TcIcon } from "./icons";
import {
  formatInventoryQuantity,
  INVENTORY_MOVEMENT_LABELS,
  isPurchaseMovement,
  movementFlow,
} from "./inventory-format";
import { openMovementDetail } from "./movement-detail";

type Movement = {
  id: string;
  code: string;
  movement_type: string;
  movement_date: string;
  created_at: string;
  created_by: string;
  responsible?: string;
  notes: string | null;
  source: { id: string; name: string } | null;
  destination: { id: string; name: string } | null;
  source_location: { id: string; name: string; warehouse_id: string | null; work_id: string | null } | null;
  destination_location: { id: string; name: string; warehouse_id: string | null; work_id: string | null } | null;
  supplier: { id: string; business_name: string } | null;
  work: { id: string; name: string } | null;
  items: {
    id: string;
    quantity: number;
    unit_cost: number | null;
    product: {
      sku: string;
      name: string;
      unit: { code: string; allows_decimals?: boolean | null } | null;
    } | null;
  }[];
};
type Warehouse = { id: string; name: string };
type Work = { id: string; name: string };
type Supplier = { id: string; business_name: string };

export default function ReportModule({
  onOpenWork,
}: {
  onOpenWork: (workId: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(`${today.slice(0, 8)}01`);
  const [endDate, setEndDate] = useState(today);
  const [type, setType] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [workId, setWorkId] = useState("all");
  const [supplierId, setSupplierId] = useState("all");
  const [search, setSearch] = useState("");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const results = await Promise.all([
      supabase
        .from("inventory_movements")
        .select(
          "id,code,movement_type,movement_date,created_at,created_by,notes,source_location:inventory_locations!inventory_movements_source_location_id_fkey(id,name,warehouse_id,work_id),destination_location:inventory_locations!inventory_movements_destination_location_id_fkey(id,name,warehouse_id,work_id),source:warehouses!inventory_movements_source_warehouse_id_fkey(id,name),destination:warehouses!inventory_movements_destination_warehouse_id_fkey(id,name),supplier:suppliers(id,business_name),work:works(id,name),items:inventory_movement_items(id,quantity,unit_cost,product:products(sku,name,unit:units(code,allows_decimals)))",
        )
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("warehouses")
        .select("id,name")
        .eq("active", true)
        .order("name"),
      supabase.from("works").select("id,name").order("name"),
      supabase
        .from("suppliers")
        .select("id,business_name")
        .order("business_name"),
    ]);
    const problem = results.find((result) => result.error)?.error;
    if (problem)
      setError(
        "No se pudieron cargar los reportes. Intenta actualizar la página.",
      );
    else {
      const movementRows = (results[0].data || []) as unknown as Movement[];
      const userIds = [
        ...new Set(movementRows.map((row) => row.created_by).filter(Boolean)),
      ];
      const profiles = userIds.length
        ? await supabase
            .from("profiles")
            .select("user_id,full_name")
            .in("user_id", userIds)
        : null;
      const names = new Map(
        (profiles?.data || []).map((profile) => [
          profile.user_id,
          profile.full_name,
        ]),
      );
      setMovements(
        movementRows.map((row) => ({
          ...row,
          responsible: names.get(row.created_by) || "Usuario registrado",
        })) as Movement[],
      );
      setWarehouses((results[1].data || []) as Warehouse[]);
      setWorks((results[2].data || []) as Work[]);
      setSuppliers((results[3].data || []) as Supplier[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const rows = useMemo(
    () =>
      movements
        .flatMap((movement) =>
          movement.items.map((item) => ({
            id: item.id,
            movement,
            quantity: Number(item.quantity),
            unitCost: item.unit_cost === null ? null : Number(item.unit_cost),
            product: item.product,
            responsible: movement.responsible || "Usuario registrado",
          })),
        )
        .filter((row) => {
          const movement = row.movement;
          const term = search.trim().toLowerCase();
          return (
            (!startDate || movement.movement_date >= startDate) &&
            (!endDate || movement.movement_date <= endDate) &&
            (type === "all" || movement.movement_type === type) &&
            (warehouseId === "all" ||
              movement.source?.id === warehouseId ||
              movement.destination?.id === warehouseId ||
              movement.source_location?.warehouse_id === warehouseId ||
              movement.destination_location?.warehouse_id === warehouseId) &&
            (workId === "all" ||
              movement.work?.id === workId ||
              movement.source_location?.work_id === workId ||
              movement.destination_location?.work_id === workId) &&
            (supplierId === "all" || movement.supplier?.id === supplierId) &&
            (!term ||
              `${movement.code} ${row.product?.sku || ""} ${row.product?.name || ""} ${row.responsible}`
                .toLowerCase()
                .includes(term))
          );
        }),
    [
      movements,
      startDate,
      endDate,
      type,
      warehouseId,
      workId,
      supplierId,
      search,
    ],
  );

  const movementCount = new Set(rows.map((row) => row.movement.id)).size;
  const incomingLines = rows.filter((row) => movementFlow(row.movement.movement_type) === "in").length;
  const outgoingLines = rows.filter((row) => movementFlow(row.movement.movement_type) === "out").length;
  const purchaseValue = rows
    .filter((row) => isPurchaseMovement(row.movement.movement_type))
    .reduce((sum, row) => sum + row.quantity * Number(row.unitCost || 0), 0);

  function exportCsv() {
    const headers = [
      "Fecha operativa",
      "Fecha y hora de registro",
      "Código",
      "Tipo",
      "SKU",
      "Producto",
      "Cantidad",
      "Unidad",
      "Costo unitario",
      "Origen",
      "Destino",
      "Obra",
      "Proveedor",
      "Responsable",
      "Observaciones",
    ];
    const data = rows.map((row) => [
      row.movement.movement_date,
      formatDateTime(row.movement.created_at),
      row.movement.code,
      INVENTORY_MOVEMENT_LABELS[row.movement.movement_type] || row.movement.movement_type,
      row.product?.sku || "",
      row.product?.name || "",
      row.quantity,
      row.product?.unit?.code || "",
      row.unitCost ?? "",
      movementSource(row.movement),
      movementDestination(row.movement),
      row.movement.work?.name || "",
      row.movement.supplier?.business_name || "",
      row.responsible,
      row.movement.notes || "",
    ]);
    const csv = [headers, ...data]
      .map((columns) =>
        columns
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(";"),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `reporte-inventario-${startDate}-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className="catalog-workspace reports-workspace">
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">Fase 4 · Control y análisis</p>
          <h2>Reportes de inventario</h2>
          <p>
            Filtra los movimientos, revisa responsables y exporta la información
            para administración.
          </p>
        </div>
        <button
          className="primary-action"
          onClick={exportCsv}
          disabled={!rows.length}
        >
          <TcIcon name="download" size={16} />
          Exportar CSV
        </button>
      </div>
      <div className="catalog-stats report-stats">
        <article>
          <span>Movimientos</span>
          <b>{movementCount}</b>
          <small>en el período filtrado</small>
        </article>
        <article>
          <span>Entradas</span>
          <b>{formatNumber(incomingLines)}</b>
          <small>líneas de materiales ingresados</small>
        </article>
        <article>
          <span>Salidas</span>
          <b>{formatNumber(outgoingLines)}</b>
          <small>líneas de materiales retirados</small>
        </article>
        <article>
          <span>Compras</span>
          <b>{formatCurrency(purchaseValue)}</b>
          <small>valor registrado</small>
        </article>
      </div>
      <div className="report-filters">
        <label>
          Desde
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <label>
          Tipo
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="all">Todos</option>
            {Object.entries(INVENTORY_MOVEMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Depósito
          <select
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
          >
            <option value="all">Todos</option>
            {warehouses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Obra
          <select
            value={workId}
            onChange={(event) => setWorkId(event.target.value)}
          >
            <option value="all">Todas</option>
            {works.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Proveedor
          <select
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            <option value="all">Todos</option>
            {suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.business_name}
              </option>
            ))}
          </select>
        </label>
        <label className="report-search">
          Buscar
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Código, SKU, producto o responsable…"
          />
        </label>
      </div>
      {error && <p className="error-banner">{error}</p>}
      <div className="catalog-card">
        {loading ? (
          <div className="catalog-loading">
            <div className="spinner" />
            <span>Preparando reportes…</span>
          </div>
        ) : rows.length ? (
          <>
            <div className="report-result-head">
              <strong>Detalle de movimientos</strong>
              <span>{rows.length} líneas encontradas</span>
            </div>
            <div className="table-scroll">
              <table className="data-table report-table">
                <thead>
                  <tr>
                    <th>Registro</th>
                    <th>Movimiento</th>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Origen / destino</th>
                    <th>Referencia</th>
                    <th>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="movement-clickable-row" tabIndex={0} onClick={() => openMovementDetail(row.movement.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openMovementDetail(row.movement.id); }}>
                      <td>
                        <strong>
                          {formatDate(row.movement.movement_date)}
                        </strong>
                        <small>{formatDateTime(row.movement.created_at)}</small>
                      </td>
                      <td>
                        <button type="button" className="movement-code-link" onClick={(event) => { event.stopPropagation(); openMovementDetail(row.movement.id); }}>{row.movement.code}</button>
                        <small>{INVENTORY_MOVEMENT_LABELS[row.movement.movement_type] || row.movement.movement_type}</small>
                      </td>
                      <td>
                        <strong>{row.product?.name || "Producto"}</strong>
                        <small>{row.product?.sku || "Sin SKU"}</small>
                      </td>
                      <td>
                        <strong>
                          {formatInventoryQuantity(row.quantity, row.product?.unit)}{" "}
                          {row.product?.unit?.code || ""}
                        </strong>
                        <small>
                          {row.unitCost !== null
                            ? formatCurrency(row.unitCost)
                            : "Sin costo"}
                        </small>
                      </td>
                      <td>
                        <strong>
                          {movementSource(row.movement)}
                        </strong>
                        <small>
                          → {movementDestination(row.movement)}
                        </small>
                      </td>
                      <td>
                        <strong>
                          {row.movement.work ? (
                            <button type="button" className="work-context-link" onClick={(event) => { event.stopPropagation(); onOpenWork(row.movement.work!.id); }}>
                              {row.movement.work.name}
                            </button>
                          ) : row.movement.supplier?.business_name || "Sin referencia"}
                        </strong>
                        <small>
                          {row.movement.notes || "Sin observaciones"}
                        </small>
                      </td>
                      <td>
                        <strong>{row.responsible}</strong>
                        <small>Usuario que registró</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="catalog-empty">
            <strong>Sin resultados</strong>
            <span>
              No hay movimientos que coincidan con los filtros seleccionados.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(
    Number(value) || 0,
  );
}
function movementSource(movement: Movement) {
  return movement.source_location?.name || movement.source?.name || movement.supplier?.business_name || "Entrada externa";
}
function movementDestination(movement: Movement) {
  return movement.destination_location?.name || movement.destination?.name || movement.work?.name || (movement.movement_type === "CONSUMO" ? "Consumido / instalado" : "Salida externa");
}
function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Asuncion",
  }).format(new Date(value));
}
