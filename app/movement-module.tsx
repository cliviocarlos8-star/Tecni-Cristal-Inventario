"use client";
import { ContextualHint } from "./onboarding/provider";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { TcIcon } from "./icons";
import {
  MaterialLink,
  MaterialQuickView,
  type MaterialRef,
} from "./material-quick-view";
import CatalogMaterialPicker, {
  getCatalogItem,
} from "./catalog-material-picker";
import {
  catalogDescription,
  catalogProductType,
  catalogUnit,
} from "./catalog-inventory";
import {
  countPositiveStocks,
  formatInventoryQuantity,
  requiresReplenishment,
} from "./inventory-format";
import { openMovementDetail } from "./movement-detail";

type Role = "ADMIN" | "GERENCIA" | "DEPOSITO" | "CONSULTA";
type Product = {
  id: string;
  sku: string;
  name: string;
  min_stock: number;
  unit: { code: string; allows_decimals?: boolean | null } | null;
};
type Warehouse = { id: string; code: string; name: string };
type Supplier = { id: string; code: string; business_name: string };
type Location = {
  id: string;
  code: string;
  name: string;
  location_type: "WORKSHOP" | "PROJECT";
  warehouse_id: string | null;
  work_id: string | null;
};
type Movement = {
  id: string;
  code: string;
  movement_type: string;
  movement_date: string;
  occurred_at: string;
  document_ref: string | null;
  received_by: string | null;
  authorized_by: string | null;
  notes: string | null;
  created_at: string;
  source_location: {
    name: string;
    code: string;
    work_id: string | null;
  } | null;
  destination_location: {
    name: string;
    code: string;
    work_id: string | null;
  } | null;
  source: { name: string; code: string } | null;
  destination: { name: string; code: string } | null;
  supplier: { business_name: string } | null;
  work: { id: string; name: string } | null;
  items: {
    quantity: number;
    product: {
      id: string;
      sku: string;
      name: string;
      unit: { code: string; allows_decimals?: boolean | null } | null;
    } | null;
  }[];
};
type Balance = {
  quantity: number;
  product_id: string;
  location_id: string;
  product: {
    sku: string;
    name: string;
    min_stock: number;
    unit: { code: string; allows_decimals?: boolean | null } | null;
  } | null;
  location: {
    name: string;
    code: string;
    location_type: "WORKSHOP" | "PROJECT";
    warehouse_id: string | null;
    work_id: string | null;
  } | null;
};
type Line = { product_id: string; quantity: string; unit_cost: string };

const movementLabels: Record<string, string> = {
  COMPRA: "Compra a depósito",
  COMPRA_DIRECTA: "Compra directa a obra",
  SALIDA_OBRA: "Salida a obra (histórico)",
  DEVOLUCION_OBRA: "Devolución (histórico)",
  CONSUMO: "Consumo / instalación",
  AJUSTE_ENTRADA: "Ajuste de entrada",
  AJUSTE_SALIDA: "Ajuste de salida",
  TRANSFERENCIA: "Transferencia",
};
const createLabels: Record<string, string> = {
  COMPRA: "Compra / entrada",
  TRANSFERENCIA: "Transferencia",
  CONSUMO: "Consumo / instalación",
  AJUSTE_ENTRADA: "Ajuste de entrada",
  AJUSTE_SALIDA: "Ajuste de salida",
};
const incoming = ["COMPRA", "AJUSTE_ENTRADA", "TRANSFERENCIA"];
const outgoing = ["CONSUMO", "AJUSTE_SALIDA", "TRANSFERENCIA"];

export default function MovementModule({
  role,
  preset,
  onOpenWork,
}: {
  role: Role;
  onOpenWork: (workId: string) => void;
  preset?: {
    action:
      | "movement"
      | "direct_purchase"
      | "transfer"
      | "consume"
      | "return"
      | "adjust";
    locationId: string;
    productId?: string;
    key: number;
  } | null;
}) {
  const [panel, setPanel] = useState<"movements" | "balances" | "count">(
    "movements",
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [type, setType] = useState("COMPRA");
  const [code, setCode] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [authorizedBy, setAuthorizedBy] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { product_id: "", quantity: "", unit_cost: "" },
  ]);
  const [countWarehouseId, setCountWarehouseId] = useState("");
  const [countValues, setCountValues] = useState<Record<string, string>>({});
  const [countNotes, setCountNotes] = useState("");
  const [quickMaterial, setQuickMaterial] = useState<MaterialRef | null>(null);
  const canPost = role !== "CONSULTA";

  async function loadData() {
    setLoading(true);
    setError("");
    const results = await Promise.all([
      supabase
        .from("products")
        .select("id,sku,name,min_stock,unit:units(code,allows_decimals)")
        .eq("active", true)
        .order("name"),
      supabase
        .from("warehouses")
        .select("id,code,name")
        .eq("active", true)
        .order("name"),
      supabase
        .from("suppliers")
        .select("id,code,business_name")
        .eq("active", true)
        .order("business_name"),
      supabase
        .from("inventory_locations")
        .select("id,code,name,location_type,warehouse_id,work_id")
        .eq("active", true)
        .order("location_type")
        .order("name"),
      supabase
        .from("inventory_movements")
        .select(
          "id,code,movement_type,movement_date,occurred_at,document_ref,received_by,authorized_by,notes,created_at,source_location:inventory_locations!inventory_movements_source_location_id_fkey(name,code,work_id),destination_location:inventory_locations!inventory_movements_destination_location_id_fkey(name,code,work_id),source:warehouses!inventory_movements_source_warehouse_id_fkey(name,code),destination:warehouses!inventory_movements_destination_warehouse_id_fkey(name,code),supplier:suppliers(business_name),work:works(id,name),items:inventory_movement_items(quantity,product:products(id,sku,name,unit:units(code,allows_decimals)))",
        )
        .order("occurred_at", { ascending: false })
        .limit(100),
      supabase
        .from("inventory_location_balances")
        .select(
          "quantity,product_id,location_id,product:products(sku,name,min_stock,unit:units(code,allows_decimals)),location:inventory_locations(name,code,location_type,warehouse_id)",
        )
        .order("quantity", { ascending: true }),
    ]);
    const problem = results.find((result) => result.error)?.error;
    if (problem)
      setError(
        "No se pudo cargar el inventario. Intenta actualizar la página.",
      );
    else {
      setProducts((results[0].data || []) as unknown as Product[]);
      setWarehouses((results[1].data || []) as Warehouse[]);
      setSuppliers((results[2].data || []) as Supplier[]);
      setLocations((results[3].data || []) as Location[]);
      setMovements((results[4].data || []) as unknown as Movement[]);
      setBalances((results[5].data || []) as unknown as Balance[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredMovements = useMemo(() => {
    const term = search.trim().toLowerCase();
    return movements.filter(
      (item) =>
        !term ||
        `${item.code} ${movementLabels[item.movement_type]} ${item.work?.name || ""} ${item.supplier?.business_name || ""}`
          .toLowerCase()
          .includes(term),
    );
  }, [movements, search]);
  const filteredBalances = useMemo(() => {
    const term = search.trim().toLowerCase();
    return balances.filter(
      (item) =>
        (warehouseFilter === "all" ||
          item.location?.code === warehouseFilter) &&
        (!term ||
          `${item.product?.sku || ""} ${item.product?.name || ""} ${item.location?.name || ""}`
            .toLowerCase()
            .includes(term)),
    );
  }, [balances, search, warehouseFilter]);
  const depotProducts = countPositiveStocks(
    balances.filter((item) => item.location?.location_type === "WORKSHOP"),
  );
  const projectProducts = countPositiveStocks(
    balances.filter((item) => item.location?.location_type === "PROJECT"),
  );
  const lowStock = products.reduce(
    (total, product) =>
      total +
      warehouses.filter((warehouse) => {
        const quantity = balances
          .filter(
            (item) =>
              item.product_id === product.id &&
              item.location?.location_type === "WORKSHOP" &&
              item.location.warehouse_id === warehouse.id,
          )
          .reduce((sum, item) => sum + Number(item.quantity), 0);
        return requiresReplenishment(quantity, product.min_stock);
      }).length,
    0,
  );
  const countLocationId =
    locations.find((item) => item.warehouse_id === countWarehouseId)?.id || "";
  const allCountRows = useMemo(
    () =>
      products.map((product) => {
        const balance = balances.find(
          (item) =>
            item.product_id === product.id &&
            item.location_id === countLocationId,
        );
        const current = Number(balance?.quantity || 0);
        const raw = countValues[product.id];
        const counted = raw === "" || raw === undefined ? null : Number(raw);
        return {
          product,
          current,
          counted,
          difference: counted === null ? null : counted - current,
        };
      }),
    [products, balances, countLocationId, countValues],
  );
  const countRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allCountRows.filter(
      (row) =>
        !term ||
        `${row.product.sku} ${row.product.name}`.toLowerCase().includes(term),
    );
  }, [allCountRows, search]);
  const countDifferences = allCountRows.filter(
    (row) => row.difference !== null && Math.abs(row.difference) > 0.0001,
  );

  function openCreate() {
    setType("COMPRA");
    setCode(`MOV-${Date.now().toString().slice(-8)}`);
    setDate(new Date().toISOString().slice(0, 10));
    setSourceId("");
    setDestinationId(locations[0]?.id || "");
    setSupplierId("");
    setNotes("");
    setDocumentRef("");
    setReceivedBy("");
    setAuthorizedBy("");
    setLines([
      { product_id: products[0]?.id || "", quantity: "", unit_cost: "" },
    ]);
    setError("");
    setMessage("");
    setModalOpen(true);
  }
  function updateType(next: string) {
    setType(next);
    if (!outgoing.includes(next)) setSourceId("");
    if (!incoming.includes(next)) setDestinationId("");
    if (next !== "COMPRA") setSupplierId("");
  }
  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }
  function removeLine(index: number) {
    setLines((current) =>
      current.length === 1 ? current : current.filter((_, i) => i !== index),
    );
  }

  useEffect(() => {
    if (!preset || loading || !locations.length) return;
    const target = locations.find((x) => x.id === preset.locationId);
    if (!target) return;
    const timer = window.setTimeout(() => {
      setPanel("movements");
      setCode(`MOV-${Date.now().toString().slice(-8)}`);
      setDate(new Date().toISOString().slice(0, 10));
      setSupplierId("");
      setNotes("");
      setDocumentRef("");
      setReceivedBy("");
      setAuthorizedBy("");
      setLines([
        { product_id: preset.productId || products[0]?.id || "", quantity: "", unit_cost: "" },
      ]);
      setError("");
      setMessage("");
      if (preset.action === "direct_purchase") {
        setType("COMPRA");
        setSourceId("");
        setDestinationId(target.id);
      } else if (preset.action === "consume") {
        setType("CONSUMO");
        setSourceId(target.id);
        setDestinationId("");
      } else if (preset.action === "return") {
        setType("TRANSFERENCIA");
        setSourceId(target.id);
        setDestinationId(
          locations.find((x) => x.location_type === "WORKSHOP")?.id || "",
        );
      } else if (preset.action === "adjust") {
        setType("AJUSTE_ENTRADA");
        setSourceId("");
        setDestinationId(target.id);
      } else {
        setType("TRANSFERENCIA");
        setSourceId(preset.action === "transfer" ? target.id : "");
        setDestinationId(preset.action === "movement" ? target.id : "");
      }
      setModalOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [preset?.key, loading, locations, products, preset]);

  async function saveMovement(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const rawLines = lines
      .filter((line) => line.product_id && Number(line.quantity) > 0)
      .map((line) => ({
        product_id: line.product_id,
        quantity: Number(line.quantity),
        unit_cost: line.unit_cost ? Number(line.unit_cost) : null,
      }));
    if (!rawLines.length) {
      setError("Agrega al menos un producto con una cantidad válida.");
      setSaving(false);
      return;
    }
    const cleanLines = [] as {
      product_id: string;
      quantity: number;
      unit_cost: number | null;
    }[];
    for (const line of rawLines) {
      const catalogItem = getCatalogItem(line.product_id);
      if (!catalogItem) {
        cleanLines.push(line);
        continue;
      }
      const existing = products.find(
        (item) => item.sku.toUpperCase() === catalogItem.code,
      );
      let productId = existing?.id;
      if (!productId) {
        const [categoryResult, unitResult] = await Promise.all([
          supabase
            .from("categories")
            .select("id,name")
            .eq("active", true)
            .order("name"),
          supabase
            .from("units")
            .select("id,code")
            .eq("active", true)
            .order("code"),
        ]);
        const categories = (categoryResult.data || []) as {
          id: string;
          name: string;
        }[];
        const units = (unitResult.data || []) as { id: string; code: string }[];
        const category =
          categories.find(
            (x) => x.name.toLowerCase() === catalogItem.category.toLowerCase(),
          ) || categories[0];
        const expectedUnit = catalogUnit(catalogItem).code;
        const unit =
          units.find((x) => x.code.toUpperCase() === expectedUnit) ||
          units.find((x) =>
            ["UN", "UND", "U"].includes(x.code.toUpperCase()),
          ) ||
          units[0];
        if (!category || !unit) {
          setError(
            "Falta una categoría o unidad activa para incorporar el material del catálogo.",
          );
          setSaving(false);
          return;
        }
        const payload = {
          sku: catalogItem.code,
          name: catalogItem.name,
          description: catalogDescription(catalogItem),
          product_type: catalogProductType(catalogItem),
          category_id: category.id,
          unit_id: unit.id,
          brand: catalogItem.line,
          color: catalogItem.color || null,
          dimensions: catalogItem.weight || null,
          weight_kg: null,
          min_stock: 0,
          target_stock: 0,
          active: true,
        };
        const inserted = await supabase
          .from("products")
          .insert(payload)
          .select("id,sku,name,min_stock,unit:units(code)")
          .single();
        if (inserted.error) {
          const retry = await supabase
            .from("products")
            .select("id,sku,name,min_stock,unit:units(code)")
            .eq("sku", catalogItem.code)
            .maybeSingle();
          if (retry.error || !retry.data) {
            setError(
              "No se pudo incorporar el material del catálogo al inventario.",
            );
            setSaving(false);
            return;
          }
          productId = (retry.data as unknown as Product).id;
        } else {
          const created = inserted.data as unknown as Product;
          productId = created.id;
          setProducts((current) => [...current, created]);
        }
      }
      cleanLines.push({ ...line, product_id: productId });
    }
    if (
      new Set(cleanLines.map((line) => line.product_id)).size !== cleanLines.length
    ) {
      setError("No repitas el mismo producto en un movimiento.");
      setSaving(false);
      return;
    }
    const { error: problem } = await supabase.rpc(
      "post_location_inventory_movement",
      {
        p_code: code.trim().toUpperCase(),
        p_movement_type: type,
        p_occurred_at: new Date(`${date}T12:00:00`).toISOString(),
        p_source_location_id: sourceId || null,
        p_destination_location_id: destinationId || null,
        p_supplier_id: supplierId || null,
        p_document_ref: documentRef,
        p_received_by: receivedBy,
        p_authorized_by: authorizedBy,
        p_notes: notes,
        p_items: cleanLines,
      },
    );
    if (problem)
      setError(
        problem.message.includes("Stock insuficiente")
          ? "Stock insuficiente para completar el movimiento."
          : problem.message.includes("duplicate")
            ? "Ese código de movimiento ya existe."
            : "No se pudo registrar. Revisa depósitos, obra y cantidades.",
      );
    else {
      setModalOpen(false);
      setMessage("Movimiento registrado y existencias actualizadas.");
      await loadData();
    }
    setSaving(false);
  }

  async function confirmPhysicalCount() {
    if (!countLocationId) {
      setError("Selecciona el depósito que vas a contar.");
      return;
    }
    const reviewed = allCountRows.filter((row) => row.counted !== null);
    if (!reviewed.length) {
      setError("Carga al menos una cantidad contada.");
      return;
    }
    if (!countDifferences.length) {
      setMessage("Conteo revisado: no se encontraron diferencias.");
      setError("");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const warehouse = warehouses.find((item) => item.id === countWarehouseId);
    const base = `CF-${Date.now().toString().slice(-8)}`;
    const commonNotes = `Conteo físico · ${warehouse?.name || "Depósito"}${countNotes.trim() ? ` · ${countNotes.trim()}` : ""}`;
    const outgoingLines = countDifferences
      .filter((row) => (row.difference || 0) < 0)
      .map((row) => ({
        product_id: row.product.id,
        quantity: Math.abs(row.difference || 0),
        unit_cost: null,
      }));
    const incomingLines = countDifferences
      .filter((row) => (row.difference || 0) > 0)
      .map((row) => ({
        product_id: row.product.id,
        quantity: row.difference || 0,
        unit_cost: null,
      }));
    const calls = [];
    if (outgoingLines.length)
      calls.push(
        supabase.rpc("post_location_inventory_movement", {
          p_code: `${base}-S`,
          p_movement_type: "AJUSTE_SALIDA",
          p_occurred_at: new Date().toISOString(),
          p_source_location_id: countLocationId,
          p_destination_location_id: null,
          p_supplier_id: null,
          p_document_ref: "Conteo físico",
          p_received_by: "",
          p_authorized_by: "",
          p_notes: commonNotes,
          p_items: outgoingLines,
        }),
      );
    if (incomingLines.length)
      calls.push(
        supabase.rpc("post_location_inventory_movement", {
          p_code: `${base}-E`,
          p_movement_type: "AJUSTE_ENTRADA",
          p_occurred_at: new Date().toISOString(),
          p_source_location_id: null,
          p_destination_location_id: countLocationId,
          p_supplier_id: null,
          p_document_ref: "Conteo físico",
          p_received_by: "",
          p_authorized_by: "",
          p_notes: commonNotes,
          p_items: incomingLines,
        }),
      );
    const results = await Promise.all(calls);
    if (results.some((result) => result.error))
      setError(
        "No se pudo confirmar el conteo completo. Actualiza la página y revisa los movimientos antes de intentarlo nuevamente.",
      );
    else {
      setCountValues({});
      setCountNotes("");
      setMessage(
        `Conteo confirmado: ${countDifferences.length} diferencias ajustadas y auditadas.`,
      );
      await loadData();
    }
    setSaving(false);
  }

  return (
    <section className="catalog-workspace">
<ContextualHint id="movements"/>
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">Operación multiubicación</p>
          <h2>Movimientos y existencias</h2>
          <p>
            El stock refleja su ubicación real: depósito u obra, con compras
            directas y trazabilidad.
          </p>
        </div>
        {canPost && (
          <button className="primary-action" onClick={openCreate}>
            <TcIcon name="plus" size={16} />
            Nuevo movimiento
          </button>
        )}
      </div>
      <div className="catalog-stats">
        <article>
          <span>Movimientos</span>
          <b>{movements.length}</b>
          <small>últimos registros</small>
        </article>
        <article>
          <span>Productos en depósitos</span>
          <b>{formatNumber(depotProducts)}</b>
          <small>con saldo · sin mezclar unidades</small>
        </article>
        <article>
          <span>Productos en obras</span>
          <b>{formatNumber(projectProducts)}</b>
          <small>por ubicación · sin depósitos</small>
        </article>
        <article>
          <span>Stock mínimo</span>
          <b>{lowStock}</b>
          <small>productos por revisar</small>
        </article>
      </div>
      <div className="catalog-tabs" role="tablist">
        <button
          className={panel === "movements" ? "active" : ""}
          onClick={() => setPanel("movements")}
        >
          <TcIcon name="movements" size={16} />
          Movimientos
        </button>
        <button
          className={panel === "balances" ? "active" : ""}
          onClick={() => setPanel("balances")}
        >
          <TcIcon name="warehouse" size={16} />
          Existencias
        </button>
        <button
          className={panel === "count" ? "active" : ""}
          onClick={() => setPanel("count")}
        >
          <TcIcon name="count" size={16} />
          Conteo físico
        </button>
      </div>
      {message && <p className="success-banner">✓ {message}</p>}
      {error && !modalOpen && <p className="error-banner">{error}</p>}
      <div className="catalog-card">
        <div className="catalog-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              panel === "movements"
                ? "Buscar código, tipo, documento, obra o proveedor…"
                : panel === "count"
                  ? "Buscar producto para contar…"
                  : "Buscar producto o ubicación…"
            }
          />
          {panel === "balances" && (
            <select
              value={warehouseFilter}
              onChange={(event) => setWarehouseFilter(event.target.value)}
            >
              <option value="all">Todas las ubicaciones</option>
              {locations.map((item) => (
                <option key={item.id} value={item.code}>
                  {item.location_type === "PROJECT" ? "Obra" : "Depósito"} ·{" "}
                  {item.name}
                </option>
              ))}
            </select>
          )}
          {panel === "count" && (
            <select
              value={countWarehouseId}
              onChange={(event) => {
                setCountWarehouseId(event.target.value);
                setCountValues({});
                setError("");
                setMessage("");
              }}
            >
              <option value="">Seleccionar depósito…</option>
              {warehouses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          )}
          <span>
            {panel === "movements"
              ? filteredMovements.length
              : panel === "balances"
                ? filteredBalances.length
                : `${countDifferences.length} diferencias`}
          </span>
        </div>
        {loading ? (
          <div className="catalog-loading">
            <div className="spinner" />
            <span>Cargando inventario…</span>
          </div>
        ) : panel === "movements" ? (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Fecha y tipo</th>
                    <th>Origen / destino</th>
                    <th>Documento / referencia</th>
                    <th>Materiales</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((item) => {
                    const source = item.source_location || item.source,
                      destination =
                        item.destination_location || item.destination;
                    return (
                      <tr key={item.id} className="movement-clickable-row" tabIndex={0} onClick={() => openMovementDetail(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openMovementDetail(item.id); }}>
                        <td>
                          <button type="button" className="movement-code-link" onClick={(event) => { event.stopPropagation(); openMovementDetail(item.id); }}>{item.code}</button>
                        </td>
                        <td>
                          <strong>{item.movement_date}</strong>
                          <small>{movementLabels[item.movement_type]}</small>
                        </td>
                        <td>
                          <strong>
                            {item.source_location?.work_id ? (
                              <WorkLink
                                id={item.source_location.work_id}
                                name={source?.name || "Obra"}
                                onOpen={onOpenWork}
                              />
                            ) : (
                              source?.name ||
                              item.supplier?.business_name ||
                              "Entrada externa"
                            )}
                          </strong>
                          <small>
                            →{" "}
                            {item.destination_location?.work_id ? (
                              <WorkLink
                                id={item.destination_location.work_id}
                                name={destination?.name || "Obra"}
                                onOpen={onOpenWork}
                              />
                            ) : (
                              destination?.name ||
                              (item.movement_type === "CONSUMO"
                                ? "Consumido / instalado"
                                : "Salida externa")
                            )}
                          </small>
                        </td>
                        <td>
                          <strong>
                            {item.document_ref ||
                              (item.work ? (
                                <WorkLink
                                  id={item.work.id}
                                  name={item.work.name}
                                  onOpen={onOpenWork}
                                />
                              ) : (
                                item.supplier?.business_name || "Sin documento"
                              ))}
                          </strong>
                          <small>
                            {item.received_by
                              ? `Recibió: ${item.received_by}`
                              : item.notes || "Sin observaciones"}
                          </small>
                        </td>
                        <td>
                          <div className="movement-material-list">
                            {item.items
                              .slice(0, 2)
                              .map((line, index) =>
                                line.product ? (
                                  <MaterialLink
                                    key={`${line.product.id}-${index}`}
                                    material={line.product}
                                    onOpen={setQuickMaterial}
                                  />
                                ) : null,
                              )}
                            {item.items.length > 2 && (
                              <small>+{item.items.length - 2} materiales</small>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!filteredMovements.length && (
              <Empty text="Aún no hay movimientos registrados." />
            )}
          </>
        ) : panel === "balances" ? (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Ubicación real</th>
                    <th>Tipo</th>
                    <th>Existencia</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBalances.map((item, index) => (
                    <tr key={`${item.product_id}-${item.location_id}-${index}`}>
                      <td>
                        <b className="sku">{item.product?.sku || "—"}</b>
                      </td>
                      <td>
                        {item.product && (
                          <MaterialLink
                            material={{
                              id: item.product_id,
                              sku: item.product.sku,
                              name: item.product.name,
                            }}
                            onOpen={setQuickMaterial}
                          />
                        )}
                      </td>
                      <td>
                        {item.location?.location_type === "PROJECT" &&
                        item.location.work_id ? (
                          <WorkLink
                            id={item.location.work_id}
                            name={item.location.name}
                            onOpen={onOpenWork}
                          />
                        ) : (
                          item.location?.name || "—"
                        )}
                      </td>
                      <td>
                        <span className="status active">
                          {item.location?.location_type === "PROJECT"
                            ? "Obra"
                            : "Depósito"}
                        </span>
                      </td>
                      <td>
                        <strong>
                          {formatInventoryQuantity(item.quantity, item.product?.unit)}{" "}
                          {item.product?.unit?.code || ""}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filteredBalances.length && (
              <Empty text="Todavía no hay existencias en esta ubicación." />
            )}
          </>
        ) : countWarehouseId ? (
          <div className="count-workspace">
            <div className="count-guide">
              <div>
                <strong>Conteo exclusivo de depósito</strong>
                <span>
                  Este conteo usa solamente el saldo del depósito seleccionado;
                  nunca incluye material de obras.
                </span>
              </div>
              <b>{countDifferences.length} diferencias</b>
            </div>
            <div className="table-scroll">
              <table className="data-table count-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Stock del depósito</th>
                    <th>Cantidad contada</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {countRows.map((row) => (
                    <tr key={row.product.id}>
                      <td>
                        <b className="sku">{row.product.sku}</b>
                      </td>
                      <td>
                        <strong>{row.product.name}</strong>
                        <small>{row.product.unit?.code || "Sin unidad"}</small>
                      </td>
                      <td>
                        <strong>
                          {formatInventoryQuantity(row.current, row.product.unit)}{" "}
                          {row.product.unit?.code || ""}
                        </strong>
                      </td>
                      <td>
                        <input
                          aria-label={`Cantidad contada de ${row.product.name}`}
                          type="number"
                          min="0"
                          step={row.product.unit?.code === "UN" ? "1" : "0.001"}
                          value={countValues[row.product.id] ?? ""}
                          onChange={(event) =>
                            setCountValues((current) => ({
                              ...current,
                              [row.product.id]: event.target.value,
                            }))
                          }
                          placeholder="Sin contar"
                        />
                      </td>
                      <td>
                        <span
                          className={
                            row.difference === null
                              ? "count-difference neutral"
                              : row.difference === 0
                                ? "count-difference ok"
                                : "count-difference alert"
                          }
                        >
                          {row.difference === null
                            ? "Pendiente"
                            : row.difference === 0
                              ? "Correcto"
                              : `${row.difference > 0 ? "+" : ""}${formatInventoryQuantity(row.difference, row.product.unit)}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="count-footer">
              <label>
                Observaciones del conteo
                <textarea
                  value={countNotes}
                  onChange={(event) => setCountNotes(event.target.value)}
                  placeholder="Ej. Conteo mensual, estante revisado, motivo conocido de diferencias…"
                />
              </label>
              <div>
                <small>
                  El ajuste afectará únicamente al depósito seleccionado.
                </small>
                <button
                  className="primary-action"
                  disabled={!canPost || saving}
                  onClick={() => void confirmPhysicalCount()}
                >
                  <TcIcon name="check" size={16} />
                  {saving ? "Confirmando…" : "Confirmar y ajustar inventario"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <Empty text="Selecciona un depósito para comenzar el conteo físico. El material de obras queda separado." />
        )}
      </div>
      {modalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <section
            className="catalog-modal movement-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Nuevo movimiento"
          >
            <div className="modal-title">
              <div>
                <p className="eyebrow">Registro auditado</p>
                <h3>Nuevo movimiento de inventario</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Cerrar"
              >
                <TcIcon name="close" />
              </button>
            </div>
            {error && <p className="error-banner">{error}</p>}
            <form className="catalog-form" onSubmit={saveMovement}>
              <div className="form-grid">
                <Field label="Código">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    required
                  />
                </Field>
                <Field label="Fecha">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Tipo">
                  <select
                    value={type}
                    onChange={(e) => updateType(e.target.value)}
                  >
                    {Object.entries(createLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                {outgoing.includes(type) && (
                  <Field label="Ubicación de origen">
                    <select
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                      required
                    >
                      <option value="">Seleccionar…</option>
                      {locations
                        .filter(
                          (item) =>
                            type !== "CONSUMO" ||
                            item.location_type === "PROJECT",
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.location_type === "PROJECT"
                              ? "Obra"
                              : "Depósito"}{" "}
                            · {item.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                {incoming.includes(type) && (
                  <Field label="Ubicación de destino">
                    <select
                      value={destinationId}
                      onChange={(e) => setDestinationId(e.target.value)}
                      required
                    >
                      <option value="">Seleccionar…</option>
                      {locations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.location_type === "PROJECT"
                            ? "Obra"
                            : "Depósito"}{" "}
                          · {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {type === "COMPRA" && (
                  <Field label="Proveedor">
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      required
                    >
                      <option value="">Seleccionar…</option>
                      {suppliers.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.business_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Documento / factura">
                  <input
                    value={documentRef}
                    onChange={(e) => setDocumentRef(e.target.value)}
                    placeholder="Factura, remisión u orden"
                  />
                </Field>
                <Field label="Recibido por">
                  <input
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                    placeholder="Nombre del receptor"
                  />
                </Field>
                <Field label="Autorizado por">
                  <input
                    value={authorizedBy}
                    onChange={(e) => setAuthorizedBy(e.target.value)}
                    placeholder="Nombre del autorizante"
                  />
                </Field>
                <Field label="Observaciones / motivo" wide>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    required={type.startsWith("AJUSTE_")}
                  />
                </Field>
              </div>
              <div className="movement-lines">
                <div className="movement-lines-title">
                  <strong>Productos del movimiento</strong>
                  <button
                    type="button"
                    className="row-action"
                    onClick={() =>
                      setLines((current) => [
                        ...current,
                        { product_id: "", quantity: "", unit_cost: "" },
                      ])
                    }
                  >
                    <TcIcon name="plus" size={15} />
                    Agregar producto
                  </button>
                </div>
                {lines.map((line, index) => {
                  const catalogItem = getCatalogItem(line.product_id);
                  const operationalUnit = products.find(
                    (product) => product.id === line.product_id,
                  )?.unit;
                  const wholeUnits = catalogItem
                    ? catalogUnit(catalogItem).code === "UN"
                    : operationalUnit?.allows_decimals === false ||
                      operationalUnit?.code?.toUpperCase() === "UN";
                  return (
                  <div className="movement-line" key={index}>
                    <div className="movement-product-field">
                      <span>Producto</span>
                      <CatalogMaterialPicker
                        value={line.product_id}
                        onChange={(value) =>
                          updateLine(index, { product_id: value })
                        }
                        products={products}
                      />
                    </div>
                    <label>
                      Cantidad
                      <input
                        type="number"
                        min={wholeUnits ? "1" : "0.001"}
                        step={wholeUnits ? "1" : "0.001"}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(index, { quantity: e.target.value })
                        }
                        required
                      />
                    </label>
                    <label>
                      Costo unitario
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unit_cost}
                        onChange={(e) =>
                          updateLine(index, { unit_cost: e.target.value })
                        }
                        disabled={type !== "COMPRA"}
                      />
                    </label>
                    <button
                      type="button"
                      className="line-remove"
                      onClick={() => removeLine(index)}
                      aria-label="Quitar producto"
                    >
                      <TcIcon name="close" size={16} />
                    </button>
                  </div>
                  );
                })}
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={saving}
                >
                  <TcIcon name="check" size={16} />
                  {saving ? "Registrando…" : "Confirmar movimiento"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      <MaterialQuickView
        material={quickMaterial}
        onClose={() => setQuickMaterial(null)}
      />
    </section>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "wide" : ""}>
      {label}
      {children}
    </label>
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
function WorkLink({
  id,
  name,
  onOpen,
}: {
  id: string;
  name: string;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="work-context-link"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(id);
      }}
    >
      {name}
    </button>
  );
}
function formatNumber(value: number) {
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(
    Number(value) || 0,
  );
}
