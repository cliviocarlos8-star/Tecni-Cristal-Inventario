"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { TcIcon } from "./icons";
import { formatInventoryQuantity, INVENTORY_MOVEMENT_LABELS, movementFlow } from "./inventory-format";
import { openMovementDetail } from "./movement-detail";
import { activeCatalogItems, catalogProductType, catalogUnit } from "./catalog-inventory";

type Role = "ADMIN" | "GERENCIA" | "DEPOSITO" | "CONSULTA";
type Category = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};
type Unit = {
  id: string;
  code: string;
  name: string;
  allows_decimals: boolean;
  active: boolean;
};
type Product = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  product_type: string;
  category_id: string;
  unit_id: string;
  brand: string | null;
  color: string | null;
  dimensions: string | null;
  weight_kg: number | null;
  min_stock: number;
  target_stock: number;
  active: boolean;
  category: { name: string } | null;
  unit: { code: string; name: string; allows_decimals?: boolean | null } | null;
  catalogOnly?: boolean;
};
type Panel = "products" | "categories" | "units";
type Modal = { kind: Panel; id?: string } | null;
type HistoryBalance = {
  quantity: number;
  warehouse: { name: string; code: string } | null;
};
type HistoryItem = {
  id: string;
  quantity: number;
  unit_cost: number | null;
  createdByName?: string;
  movement: {
    id: string;
    code: string;
    movement_type: string;
    movement_date: string;
    created_at: string;
    created_by: string;
    notes: string | null;
    source: { name: string } | null;
    destination: { name: string } | null;
    work: { id: string; name: string } | null;
    supplier: { business_name: string } | null;
  } | null;
};

const emptyProduct = {
  sku: "",
  name: "",
  description: "",
  product_type: "MATERIAL",
  category_id: "",
  unit_id: "",
  brand: "",
  color: "",
  dimensions: "",
  weight_kg: "",
  min_stock: "0",
  target_stock: "0",
  active: true,
};
const emptyCategory = { name: "", description: "", active: true };
const emptyUnit = { code: "", name: "", allows_decimals: true, active: true };
export default function ProductModule({
  role,
  onOpenWork,
}: {
  role: Role;
  onOpenWork: (workId: string) => void;
}) {
  const [panel, setPanel] = useState<Panel>("products");
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [historyBalances, setHistoryBalances] = useState<HistoryBalance[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [unitForm, setUnitForm] = useState(emptyUnit);
  const canManage = role === "ADMIN" || role === "GERENCIA";

  async function loadData() {
    setLoading(true);
    setError("");
    const [categoryResult, unitResult, productResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name,description,active")
        .order("name"),
      supabase
        .from("units")
        .select("id,code,name,allows_decimals,active")
        .order("code"),
      supabase
        .from("products")
        .select(
          "id,sku,name,description,product_type,category_id,unit_id,brand,color,dimensions,weight_kg,min_stock,target_stock,active,category:categories(name),unit:units(code,name,allows_decimals)",
        )
        .order("name"),
    ]);
    const problem =
      categoryResult.error || unitResult.error || productResult.error;
    if (problem)
      setError(
        "No se pudieron cargar los catálogos. Intenta actualizar la página.",
      );
    else {
      setCategories((categoryResult.data || []) as Category[]);
      setUnits((unitResult.data || []) as Unit[]);
      setProducts((productResult.data || []) as unknown as Product[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const allProducts = useMemo(() => {
    const operationalCodes = new Set(products.map((item) => item.sku.toUpperCase()));
    const catalogOnly: Product[] = activeCatalogItems
      .filter((item) => !operationalCodes.has(item.code.toUpperCase()))
      .map((item) => {
        const unit = catalogUnit(item);
        return {
          id: item.catalog_item_id,
          sku: item.code,
          name: item.name,
          description: `Catálogo técnico · ${item.line}`,
          product_type: catalogProductType(item),
          category_id: "",
          unit_id: "",
          brand: item.line,
          color: item.color || null,
          dimensions: item.weight || null,
          weight_kg: null,
          min_stock: 0,
          target_stock: 0,
          active: true,
          category: { name: item.category },
          unit: {
            code: unit.code,
            name: unit.code,
            allows_decimals: unit.allows_decimals,
          },
          catalogOnly: true,
        };
      });
    return [...products, ...catalogOnly].sort((a, b) =>
      a.name.localeCompare(b.name, "es", { numeric: true }),
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allProducts;
    return allProducts.filter((item) =>
      `${item.sku} ${item.name} ${item.brand || ""} ${item.category?.name || ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [allProducts, search]);

  function openCreate(kind: Panel) {
    setMessage("");
    setError("");
    setModal({ kind });
    if (kind === "products")
      setProductForm({
        ...emptyProduct,
        category_id: categories.find((item) => item.active)?.id || "",
        unit_id: units.find((item) => item.active)?.id || "",
      });
    if (kind === "categories") setCategoryForm(emptyCategory);
    if (kind === "units") setUnitForm(emptyUnit);
  }

  function openEdit(kind: Panel, id: string) {
    setMessage("");
    setError("");
    setModal({ kind, id });
    if (kind === "products") {
      const item = products.find((row) => row.id === id);
      if (!item) return;
      setProductForm({
        sku: item.sku,
        name: item.name,
        description: item.description || "",
        product_type: item.product_type,
        category_id: item.category_id,
        unit_id: item.unit_id,
        brand: item.brand || "",
        color: item.color || "",
        dimensions: item.dimensions || "",
        weight_kg: item.weight_kg?.toString() || "",
        min_stock: item.min_stock.toString(),
        target_stock: item.target_stock.toString(),
        active: item.active,
      });
    }
    if (kind === "categories") {
      const item = categories.find((row) => row.id === id);
      if (item)
        setCategoryForm({
          name: item.name,
          description: item.description || "",
          active: item.active,
        });
    }
    if (kind === "units") {
      const item = units.find((row) => row.id === id);
      if (item)
        setUnitForm({
          code: item.code,
          name: item.name,
          allows_decimals: item.allows_decimals,
          active: item.active,
        });
    }
  }

  async function openHistory(item: Product) {
    setHistoryProduct(item);
    setHistoryBalances([]);
    setHistoryItems([]);
    setHistoryLoading(true);
    setError("");
    const [balanceResult, itemResult] = await Promise.all([
      supabase
        .from("inventory_balances")
        .select("quantity,warehouse:warehouses(name,code)")
        .eq("product_id", item.id),
      supabase
        .from("inventory_movement_items")
        .select(
          "id,quantity,unit_cost,movement:inventory_movements(id,code,movement_type,movement_date,created_at,created_by,notes,source:warehouses!inventory_movements_source_warehouse_id_fkey(name),destination:warehouses!inventory_movements_destination_warehouse_id_fkey(name),work:works(id,name),supplier:suppliers(business_name))",
        )
        .eq("product_id", item.id),
    ]);
    if (balanceResult.error || itemResult.error)
      setError("No se pudo cargar el historial del producto.");
    else {
      setHistoryBalances(
        (balanceResult.data || []) as unknown as HistoryBalance[],
      );
      const rows = (itemResult.data || []) as unknown as HistoryItem[];
      const userIds = [
        ...new Set(
          rows
            .map((row) => row.movement?.created_by)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      const profileResult = userIds.length
        ? await supabase
            .from("profiles")
            .select("user_id,full_name")
            .in("user_id", userIds)
        : null;
      const names = new Map(
        (profileResult?.data || []).map((profile) => [
          profile.user_id,
          profile.full_name,
        ]),
      );
      setHistoryItems(
        rows
          .map((row) => ({
            ...row,
            createdByName:
              names.get(row.movement?.created_by || "") || "Usuario registrado",
          }))
          .sort((a, b) =>
            (b.movement?.created_at || "").localeCompare(
              a.movement?.created_at || "",
            ),
          ),
      );
    }
    setHistoryLoading(false);
  }

  function friendlyError(code?: string) {
    return code === "23505"
      ? "Ese código o nombre ya está registrado."
      : code === "23503"
        ? "Selecciona una categoría y unidad válidas."
        : "No se pudo guardar. Revisa los datos e intenta nuevamente.";
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...productForm,
      sku: productForm.sku.trim().toUpperCase(),
      name: productForm.name.trim(),
      description: productForm.description.trim() || null,
      brand: productForm.brand.trim() || null,
      color: productForm.color.trim() || null,
      dimensions: productForm.dimensions.trim() || null,
      weight_kg: productForm.weight_kg ? Number(productForm.weight_kg) : null,
      min_stock: Number(productForm.min_stock || 0),
      target_stock: Number(productForm.target_stock || 0),
    };
    const result = modal?.id
      ? await supabase.from("products").update(payload).eq("id", modal.id)
      : await supabase.from("products").insert(payload);
    if (result.error) setError(friendlyError(result.error.code));
    else {
      setModal(null);
      setMessage(
        modal?.id ? "Producto actualizado." : "Producto creado correctamente.",
      );
      await loadData();
    }
    setSaving(false);
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      name: categoryForm.name.trim(),
      description: categoryForm.description.trim() || null,
      active: categoryForm.active,
    };
    const result = modal?.id
      ? await supabase.from("categories").update(payload).eq("id", modal.id)
      : await supabase.from("categories").insert(payload);
    if (result.error) setError(friendlyError(result.error.code));
    else {
      setModal(null);
      setMessage(
        modal?.id
          ? "Categoría actualizada."
          : "Categoría creada correctamente.",
      );
      await loadData();
    }
    setSaving(false);
  }

  async function saveUnit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      code: unitForm.code.trim().toUpperCase(),
      name: unitForm.name.trim(),
      allows_decimals: unitForm.allows_decimals,
      active: unitForm.active,
    };
    const result = modal?.id
      ? await supabase.from("units").update(payload).eq("id", modal.id)
      : await supabase.from("units").insert(payload);
    if (result.error) setError(friendlyError(result.error.code));
    else {
      setModal(null);
      setMessage(
        modal?.id ? "Unidad actualizada." : "Unidad creada correctamente.",
      );
      await loadData();
    }
    setSaving(false);
  }

  const panelLabel =
    panel === "products"
      ? "producto"
      : panel === "categories"
        ? "categoría"
        : "unidad";
  return (
    <section className="catalog-workspace">
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">Fase 2 · Catálogos maestros</p>
          <h2>Productos y clasificación</h2>
          <p>
            Registra los materiales que luego tendrán entradas, salidas y
            existencias.
          </p>
        </div>
        {canManage && (
          <button className="primary-action" onClick={() => openCreate(panel)}>
            <TcIcon name="plus" size={16} />
            Nueva {panelLabel}
          </button>
        )}
      </div>
      <div className="catalog-stats">
        <article>
          <span>Productos</span>
          <b>{allProducts.length}</b>
          <small>{products.length} operativos · {allProducts.length - products.length} sin historial</small>
        </article>
        <article>
          <span>Categorías</span>
          <b>{categories.length}</b>
          <small>clasificación maestra</small>
        </article>
        <article>
          <span>Unidades</span>
          <b>{units.length}</b>
          <small>medidas disponibles</small>
        </article>
      </div>
      <div className="catalog-tabs" role="tablist">
        <button
          className={panel === "products" ? "active" : ""}
          onClick={() => setPanel("products")}
        >
          Productos
        </button>
        <button
          className={panel === "categories" ? "active" : ""}
          onClick={() => setPanel("categories")}
        >
          Categorías
        </button>
        <button
          className={panel === "units" ? "active" : ""}
          onClick={() => setPanel("units")}
        >
          Unidades
        </button>
      </div>
      {message && <p className="success-banner">✓ {message}</p>}
      {error && !modal && <p className="error-banner">{error}</p>}
      {loading ? (
        <div className="catalog-loading">
          <div className="spinner" />
          <span>Cargando catálogos…</span>
        </div>
      ) : (
        <>
          {panel === "products" && (
            <div className="catalog-card">
              <div className="catalog-toolbar">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por SKU, nombre, marca o categoría…"
                />
                <span>{filteredProducts.length} registros</span>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th>Categoría</th>
                      <th>Unidad</th>
                      <th>Stock mínimo</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <b className="sku">{item.sku}</b>
                        </td>
                        <td>
                          <strong>{item.name}</strong>
                          <small>
                            {[item.brand, item.color]
                              .filter(Boolean)
                              .join(" · ") || item.product_type}
                          </small>
                        </td>
                        <td>{item.category?.name || "—"}</td>
                        <td>{item.unit?.code || "—"}</td>
                        <td>{item.min_stock}</td>
                        <td>
                          <Status active={item.active} />
                        </td>
                        <td>
                          <div className="row-actions">
                            {item.catalogOnly ? (
                              <span className="status">Catálogo · stock 0</span>
                            ) : (
                              <button
                                className="row-action"
                                onClick={() => void openHistory(item)}
                              >
                                Historial
                              </button>
                            )}
                            {canManage && !item.catalogOnly && (
                              <button
                                className="row-action"
                                onClick={() => openEdit("products", item.id)}
                              >
                                Editar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredProducts.length && (
                <Empty
                  text={
                    products.length
                      ? "No hay productos con esa búsqueda."
                      : "Aún no hay productos. Crea el primero para comenzar."
                  }
                />
              )}
            </div>
          )}
          {panel === "categories" && (
            <div className="catalog-card">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th>Descripción</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td>{item.description || "—"}</td>
                        <td>
                          <Status active={item.active} />
                        </td>
                        <td>
                          {canManage && (
                            <button
                              className="row-action"
                              onClick={() => openEdit("categories", item.id)}
                            >
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {panel === "units" && (
            <div className="catalog-card">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Unidad de medida</th>
                      <th>Decimales</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <b className="sku">{item.code}</b>
                        </td>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td>{item.allows_decimals ? "Sí" : "No"}</td>
                        <td>
                          <Status active={item.active} />
                        </td>
                        <td>
                          {canManage && (
                            <button
                              className="row-action"
                              onClick={() => openEdit("units", item.id)}
                            >
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {modal?.kind === "products" && (
        <ModalShell
          title={modal.id ? "Editar producto" : "Nuevo producto"}
          onClose={() => setModal(null)}
          error={error}
        >
          <form onSubmit={saveProduct} className="catalog-form">
            <div className="form-grid">
              <label>
                SKU
                <input
                  value={productForm.sku}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      sku: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="Ej. PERF-001"
                  required
                />
              </label>
              <label>
                Nombre
                <input
                  value={productForm.name}
                  onChange={(e) =>
                    setProductForm({ ...productForm, name: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                Categoría
                <select
                  value={productForm.category_id}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      category_id: e.target.value,
                    })
                  }
                  required
                >
                  <option value="">Seleccionar…</option>
                  {categories
                    .filter((x) => x.active || x.id === productForm.category_id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Unidad
                <select
                  value={productForm.unit_id}
                  onChange={(e) =>
                    setProductForm({ ...productForm, unit_id: e.target.value })
                  }
                  required
                >
                  <option value="">Seleccionar…</option>
                  {units
                    .filter((x) => x.active || x.id === productForm.unit_id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.code} · {x.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Tipo
                <select
                  value={productForm.product_type}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      product_type: e.target.value,
                    })
                  }
                >
                  {[
                    "MATERIAL",
                    "PERFIL",
                    "VIDRIO",
                    "HERRAJE",
                    "INSUMO",
                    "OTRO",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Marca
                <input
                  value={productForm.brand}
                  onChange={(e) =>
                    setProductForm({ ...productForm, brand: e.target.value })
                  }
                />
              </label>
              <label>
                Color / acabado
                <input
                  value={productForm.color}
                  onChange={(e) =>
                    setProductForm({ ...productForm, color: e.target.value })
                  }
                />
              </label>
              <label>
                Dimensiones
                <input
                  value={productForm.dimensions}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      dimensions: e.target.value,
                    })
                  }
                  placeholder="Ej. 6 m · 50 × 25 mm"
                />
              </label>
              <label>
                Peso en kg
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={productForm.weight_kg}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      weight_kg: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                Stock mínimo
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={productForm.min_stock}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      min_stock: e.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                Stock objetivo
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={productForm.target_stock}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      target_stock: e.target.value,
                    })
                  }
                  required
                />
              </label>
              <label className="wide">
                Descripción
                <textarea
                  value={productForm.description}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      description: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={productForm.active}
                onChange={(e) =>
                  setProductForm({ ...productForm, active: e.target.checked })
                }
              />{" "}
              Producto activo
            </label>
            <FormActions saving={saving} onCancel={() => setModal(null)} />
          </form>
        </ModalShell>
      )}
      {modal?.kind === "categories" && (
        <ModalShell
          title={modal.id ? "Editar categoría" : "Nueva categoría"}
          onClose={() => setModal(null)}
          error={error}
        >
          <form onSubmit={saveCategory} className="catalog-form">
            <label>
              Nombre
              <input
                value={categoryForm.name}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, name: e.target.value })
                }
                required
              />
            </label>
            <label>
              Descripción
              <textarea
                value={categoryForm.description}
                onChange={(e) =>
                  setCategoryForm({
                    ...categoryForm,
                    description: e.target.value,
                  })
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={categoryForm.active}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, active: e.target.checked })
                }
              />{" "}
              Categoría activa
            </label>
            <FormActions saving={saving} onCancel={() => setModal(null)} />
          </form>
        </ModalShell>
      )}
      {modal?.kind === "units" && (
        <ModalShell
          title={modal.id ? "Editar unidad" : "Nueva unidad"}
          onClose={() => setModal(null)}
          error={error}
        >
          <form onSubmit={saveUnit} className="catalog-form">
            <label>
              Código
              <input
                value={unitForm.code}
                maxLength={10}
                onChange={(e) =>
                  setUnitForm({
                    ...unitForm,
                    code: e.target.value.toUpperCase(),
                  })
                }
                placeholder="Ej. UN"
                required
              />
            </label>
            <label>
              Nombre
              <input
                value={unitForm.name}
                onChange={(e) =>
                  setUnitForm({ ...unitForm, name: e.target.value })
                }
                required
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={unitForm.allows_decimals}
                onChange={(e) =>
                  setUnitForm({
                    ...unitForm,
                    allows_decimals: e.target.checked,
                  })
                }
              />{" "}
              Permite cantidades decimales
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={unitForm.active}
                onChange={(e) =>
                  setUnitForm({ ...unitForm, active: e.target.checked })
                }
              />{" "}
              Unidad activa
            </label>
            <FormActions saving={saving} onCancel={() => setModal(null)} />
          </form>
        </ModalShell>
      )}
      {historyProduct && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryProduct(null);
          }}
        >
          <section
            className="catalog-modal history-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Historial de ${historyProduct.name}`}
          >
            <div className="modal-title">
              <div>
                <p className="eyebrow">Trazabilidad de producto</p>
                <h3>
                  {historyProduct.sku} · {historyProduct.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryProduct(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            {error && <p className="error-banner">{error}</p>}
            {historyLoading ? (
              <div className="catalog-loading">
                <div className="spinner" />
                <span>Cargando historial…</span>
              </div>
            ) : (
              <>
                <div className="history-summary">
                  <article>
                    <span>Existencia total</span>
                    <b>
                      {formatInventoryQuantity(
                        historyBalances.reduce(
                          (sum, row) => sum + Number(row.quantity),
                          0,
                        ),
                        historyProduct.unit,
                      )}{" "}
                      {historyProduct.unit?.code || ""}
                    </b>
                  </article>
                  <article>
                    <span>Stock mínimo</span>
                    <b>
                      {formatInventoryQuantity(historyProduct.min_stock, historyProduct.unit)}{" "}
                      {historyProduct.unit?.code || ""}
                    </b>
                  </article>
                  <article>
                    <span>Movimientos</span>
                    <b>{historyItems.length}</b>
                  </article>
                </div>
                <div className="history-section">
                  <h4>Existencias por depósito</h4>
                  {historyBalances.length ? (
                    <div className="history-balances">
                      {historyBalances.map((row, index) => (
                        <div key={`${row.warehouse?.code}-${index}`}>
                          <span>{row.warehouse?.name || "Depósito"}</span>
                          <strong>
                            {formatInventoryQuantity(row.quantity, historyProduct.unit)}{" "}
                            {historyProduct.unit?.code || ""}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="history-empty">
                      Sin existencias registradas.
                    </p>
                  )}
                </div>
                <div className="history-section">
                  <h4>Historial detallado de movimientos</h4>
                  {historyItems.length ? (
                    <div className="history-timeline">
                      {historyItems.map((item) => (
                        <article key={item.id} className="movement-clickable-card" tabIndex={item.movement ? 0 : -1} onClick={() => item.movement && openMovementDetail(item.movement.id)} onKeyDown={(event) => { if (item.movement && (event.key === "Enter" || event.key === " ")) openMovementDetail(item.movement.id); }}>
                          <i
                            className={
                              movementFlow(item.movement?.movement_type || "") === "out"
                                ? "out"
                                : ""
                            }
                          />
                          <div className="history-main">
                            <div className="history-event-title">
                              <button type="button" className="movement-code-link" onClick={(event) => { event.stopPropagation(); if (item.movement) openMovementDetail(item.movement.id); }}>
                                {item.movement?.code} ·{" "}
                                {
                                  INVENTORY_MOVEMENT_LABELS[
                                    item.movement?.movement_type || ""
                                  ]
                                }
                              </button>
                              <b>
                                {formatInventoryQuantity(item.quantity, historyProduct.unit)}{" "}
                                {historyProduct.unit?.code || ""}
                              </b>
                            </div>
                            <div className="history-audit">
                              <span>
                                <em>Ejecutado</em>
                                {formatDateTime(item.movement?.created_at)}
                              </span>
                              <span>
                                <em>Responsable</em>
                                {item.createdByName}
                              </span>
                              <span>
                                <em>Fecha operativa</em>
                                {formatDate(item.movement?.movement_date)}
                              </span>
                              {item.unit_cost !== null && (
                                <span>
                                  <em>Costo unitario</em>
                                  {formatCurrency(item.unit_cost)}
                                </span>
                              )}
                            </div>
                            <div className="history-route">
                              <span>
                                <em>Origen</em>
                                {item.movement?.source?.name ||
                                  "Entrada externa"}
                              </span>
                              <span className="history-arrow">→</span>
                              <span>
                                <em>Destino</em>
                                {item.movement?.destination?.name ||
                                  "Salida externa"}
                              </span>
                            </div>
                            {(item.movement?.work?.name ||
                              item.movement?.supplier?.business_name) && (
                              <div className="history-references">
                                {item.movement?.work?.name && (
                                  <span>
                                    <em>Obra</em>
                                    <button type="button" className="work-context-link" onClick={(event) => { event.stopPropagation(); onOpenWork(item.movement!.work!.id); }}>
                                      {item.movement.work.name}
                                    </button>
                                  </span>
                                )}
                                {item.movement?.supplier?.business_name && (
                                  <span>
                                    <em>Proveedor</em>
                                    {item.movement.supplier.business_name}
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="history-notes">
                              <em>Observaciones</em>
                              {item.movement?.notes ||
                                "Sin observaciones registradas."}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="history-empty">
                      Este producto todavía no tiene movimientos.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function Status({ active }: { active: boolean }) {
  return (
    <span className={active ? "status active" : "status"}>
      {active ? "Activo" : "Inactivo"}
    </span>
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
function ModalShell({
  title,
  onClose,
  error,
  children,
}: {
  title: string;
  onClose: () => void;
  error: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="catalog-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-title">
          <div>
            <p className="eyebrow">Catálogo maestro</p>
            <h3>{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        {error && <p className="error-banner">{error}</p>}
        {children}
      </section>
    </div>
  );
}
function FormActions({
  saving,
  onCancel,
}: {
  saving: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="form-actions">
      <button type="button" onClick={onCancel}>
        Cancelar
      </button>
      <button className="primary-action" type="submit" disabled={saving}>
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}
function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Asuncion",
    timeZoneName: "short",
  }).format(new Date(value));
}
function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}
