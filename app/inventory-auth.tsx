"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, lazy, Suspense, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import ProductModule from "./product-module";
import WarehouseModule from "./warehouse-module";
import SupplierModule from "./supplier-module";
import WorkModule from "./work-module";
import MovementModule from "./movement-module";
import DashboardModule from "./dashboard-module";
import StockAlertsModule from "./stock-alerts-module";
import ReportModule from "./report-module";
import UserModule from "./user-module";
import WorkInventoryDetail, { WorkAction } from "./work-inventory-detail";
import AuditModule from "./audit-module";
import { IconName, TcIcon } from "./icons";
import GlobalMovementDetail from "./movement-detail";
import QuickInventoryAction from "./quick-inventory-action";

import { IntroductionLink } from "./onboarding/provider";

const MobileInventoryApp = lazy(() => import("./mobile-inventory-app"));

type Profile = {
  full_name: string;
  role: "ADMIN" | "GERENCIA" | "DEPOSITO" | "CONSULTA";
  active: boolean;
};
type SearchWork = {
  id: string;
  code: string;
  name: string;
  client_name: string;
};
const menu = [
  "Inicio",
  "Alertas",
  "Productos",
  "Movimientos",
  "Obras",
  "Proveedores",
  "Depósitos",
  "Reportes",
  "Auditoría",
  "Usuarios",
];
const menuIcons: Record<string, IconName> = {
  Inicio: "home",
  Alertas: "alert",
  Productos: "products",
  Movimientos: "movements",
  Obras: "works",
  Proveedores: "suppliers",
  Depósitos: "warehouse",
  Reportes: "reports",
  Auditoría: "database-check",
  Usuarios: "users",
};

export default function InventoryAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [section, setSection] = useState("Inicio");
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileLayout, setMobileLayout] = useState<boolean | null>(null);
  const [workId, setWorkId] = useState<string | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchWorks, setSearchWorks] = useState<SearchWork[]>([]);
  const [movementPreset, setMovementPreset] = useState<{
    action: WorkAction;
    locationId: string;
    key: number;
  } | null>(null);
  const appSwitcher = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const update = () => setMobileLayout(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error)
          setMessage(
            "No se pudo verificar la sesión. Actualiza la página e intenta nuevamente.",
          );
        setSession(data.session);
      })
      .catch(() => setMessage("No se pudo conectar con el sistema de acceso."))
      .finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setProfile(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const readRoute = () => {
      const match = window.location.pathname.match(/^\/obras\/([^/]+)$/);
      setWorkId(match ? decodeURIComponent(match[1]) : null);
    };
    readRoute();
    window.addEventListener("popstate", readRoute);
    return () => window.removeEventListener("popstate", readRoute);
  }, []);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("works")
      .select("id,code,name,client_name")
      .order("name")
      .then(({ data }) => setSearchWorks((data || []) as SearchWork[]));
  }, [profile]);

  useEffect(() => {
    if (!session?.user.id) return;
    supabase
      .from("profiles")
      .select("full_name, role, active")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data?.active) {
          setProfile(null);
          setMessage("Tu usuario todavía no tiene un perfil autorizado.");
        } else {
          setProfile(data as Profile);
          setMessage("");
        }
        setLoading(false);
      });
  }, [session]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!appSwitcher.current?.contains(event.target as Node))
        setAppMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAppMenuOpen(false);
        setUserMenuOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) {
      const { data: canActivate } = await supabase.rpc("can_activate_account", {
        p_email: normalizedEmail,
      });
      if (canActivate) {
        if (password.length < 8)
          setMessage(
            "Para activar tu cuenta por primera vez, elige una contraseña de al menos 8 caracteres.",
          );
        else {
          const { data: signup, error: signupError } =
            await supabase.auth.signUp({ email: normalizedEmail, password });
          if (signupError)
            setMessage(
              "No se pudo activar la cuenta. Prueba otra contraseña de al menos 8 caracteres.",
            );
          else if (!signup.session)
            setMessage(
              "La cuenta fue creada, pero la confirmación por correo sigue activada. Comunícate con administración.",
            );
          else setMessage("Cuenta activada correctamente. Ingresando…");
        }
      } else setMessage("Correo o contraseña incorrectos.");
    }
    setSubmitting(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }
  const selectSection = (item: string) => {
    setWorkId(null);
    setSection(item);
    setMobileMenuOpen(false);
    if (window.location.pathname !== "/")
      window.history.pushState({ section: item }, "", "/");
  };
  useEffect(() => {
    const navigate = (destination: string) => {
      const target: Record<string,string> = {home:"Inicio", works:"Obras", movements:"Movimientos"};
      if(target[destination]) selectSection(target[destination]);
    };
    const listener = (e: Event) => navigate((e as CustomEvent<string>).detail);
    window.addEventListener("tc-learning-navigate",listener);
    const start = new URLSearchParams(window.location.search).get("start");
    if(start && mobileLayout === false){navigate(start);window.history.replaceState({},"","/");}
    return () => window.removeEventListener("tc-learning-navigate",listener);
  },[mobileLayout]);
  const openWork = (id: string) => {
    setWorkId(id);
    setGlobalQuery("");
    setMobileMenuOpen(false);
    window.history.pushState(
      { workId: id, from: section },
      "",
      `/obras/${encodeURIComponent(id)}`,
    );
  };
  const returnFromWork = () => {
    if (window.history.length > 1) window.history.back();
    else {
      setWorkId(null);
      setSection("Obras");
      window.history.replaceState({}, "", "/");
    }
  };
  const startWorkAction = (action: WorkAction, locationId: string) => {
    setMovementPreset({ action, locationId, key: Date.now() });
    setWorkId(null);
    setSection("Movimientos");
    window.history.pushState({ section: "Movimientos" }, "", "/");
  };
  const workMatches =
    globalQuery.trim().length >= 2
      ? searchWorks
          .filter((x) =>
            `${x.code} ${x.name} ${x.client_name}`
              .toLowerCase()
              .includes(globalQuery.trim().toLowerCase()),
          )
          .slice(0, 6)
      : [];
  const initials =
    profile?.full_name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "TC";

  if (loading)
    return (
      <main className="auth-screen">
        <div className="loading-card">
          <div className="spinner" />
          <p>Verificando acceso…</p>
        </div>
      </main>
    );

  if (!session || !profile)
    return (
      <main className="auth-screen">
        <section className="auth-brand">
          <div className="auth-brand-lockup">
            <img
              className="auth-logo"
              src="/brand/tecni-cristal-logo.jpg"
              alt="Tecni Cristal — Aluminio y Vidrio"
            />
            <div>
              <strong>TECNI CRISTAL</strong>
              <span>Aluminio &amp; Vidrio</span>
            </div>
          </div>
          <div className="auth-brand-copy">
            <p className="auth-kicker"><span /> Sistema interno</p>
            <h1>Control total.<br />Información clara.</h1>
            <p>
              Inventario, obras y movimientos conectados en un único lugar.
            </p>
          </div>
          <div className="auth-brand-foot">
            <span>Inventario</span>
            <i aria-hidden="true" />
            <span>Gestión de materiales</span>
          </div>
          <div className="glass-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>
        <section className="login-panel">
          <form className="login-card" onSubmit={signIn}>
            <div className="login-heading">
              <p className="eyebrow">Portal privado</p>
              <h2>Bienvenido</h2>
            </div>
            <p className="form-intro">
              Ingresa con tu correo autorizado para acceder al inventario.
            </p>
            <label>
              Correo electrónico
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </label>
            {message && (
              <p className="form-message" role="alert">
                {message}
              </p>
            )}
            <button type="submit" disabled={submitting}>
              {submitting ? "Ingresando…" : "Ingresar al sistema"}
            </button>
            <p className="access-note">
              ¿Es tu primera vez? La contraseña que elijas quedará registrada.
              Debe tener al menos 8 caracteres.
            </p>
            {session && (
              <button className="text-button" type="button" onClick={signOut}>
                Cerrar sesión actual
              </button>
            )}
          </form>
        </section>
      </main>
    );

  if (mobileLayout === null)
    return (
      <main className="auth-screen">
        <div className="loading-card"><div className="spinner"/><p>Preparando interfaz…</p></div>
      </main>
    );

  if (mobileLayout)
    return workId ? (
      <main className="mobile-inventory-shell mobile-work-detail-shell">
        <WorkInventoryDetail workId={workId} role={profile.role} onBack={returnFromWork} onAction={startWorkAction}/>
        <GlobalMovementDetail />
      </main>
    ) : (
      <>
        <Suspense fallback={<main className="auth-screen"><div className="loading-card"><div className="spinner"/><p>Preparando interfaz móvil…</p></div></main>}>
          <MobileInventoryApp role={profile.role} userName={profile.full_name} onSignOut={signOut} onOpenWork={openWork} initialFlow={movementPreset}/>
        </Suspense>
        <GlobalMovementDetail />
      </>
    );

  return (
    <main
      className={`shell ${mobileMenuOpen ? "menu-open" : ""} ${section === "Inicio" ? "home-dashboard" : ""}`}
    >
      {mobileMenuOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Cerrar menú"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside className="sidebar">
        <div className="inventory-switcher" ref={appSwitcher}>
          <button
            className="inventory-brand"
            type="button"
            onClick={() => setAppMenuOpen((value) => !value)}
            aria-expanded={appMenuOpen}
            aria-haspopup="menu"
          >
            <img
              className="sidebar-logo"
              src="/brand/tecni-cristal-logo.jpg"
              alt="Tecni Cristal — Aluminio y Vidrio"
            />
            <span>
              <strong>Tecni Cristal</strong>
              <small>Inventario</small>
            </span>
            <i aria-hidden="true">⌄</i>
          </button>
          {appMenuOpen && (
            <div className="inventory-app-menu" role="menu">
              <span>CAMBIAR SECCIÓN</span>
              <a
                href="/catalogo-tecnico"
                role="menuitem"
              >
                <b>Catálogo técnico</b>
                <small>Perfiles y componentes</small>
              </a>
              <a
                className="current"
                href="/"
                role="menuitem"
              >
                <b>Control de inventario</b>
                <small>Productos, obras y depósitos</small>
              </a>
            </div>
          )}
        </div>
        <div className="sidebar-quick-action">
          <QuickInventoryAction role={profile.role} workId={workId} />
        </div>
        <nav aria-label="Navegación principal">
          {menu
            .filter(
              (item) =>
                !(item === "Usuarios" && profile.role !== "ADMIN") &&
                !(
                  item === "Auditoría" &&
                  !(["ADMIN", "GERENCIA"] as string[]).includes(profile.role)
                ),
            )
            .map((item) => (
              <button
                key={item}
                className={section === item ? "active" : ""}
                onClick={() => selectSection(item)}
              >
                <i>
                  <TcIcon name={menuIcons[item]} />
                </i>
                <span>{item}</span>
              </button>
            ))}
        </nav>
        <div className="sidebar-foot">
          <span>Ayuda</span><IntroductionLink />
          <span>Sistema operativo</span>
          <b>
            <TcIcon name="database-check" size={15} />
            Base conectada
          </b>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <button
            className="menu-trigger"
            aria-label="Abrir menú"
            title="Abrir menú"
            onClick={() => setMobileMenuOpen(true)}
          >
            <TcIcon name="menu" />
          </button>
          <div className="page-title">
            <small>Inventario / {workId ? "Obras / Ficha" : section}</small>
            <h1>
              {workId
                ? "Ficha de obra"
                : section === "Inicio"
                  ? "Control de inventario"
                  : section}
            </h1>
            {section === "Inicio" && !workId && (
              <p>Resumen general de existencias y operaciones</p>
            )}
          </div>
          <div className="global-search-wrap">
            <label className="global-search">
              <TcIcon name="search" size={18} />
              <input
                aria-label="Buscar"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Buscar obra por nombre, código o cliente…"
              />
            </label>
            {workMatches.length > 0 && (
              <div className="global-search-results">
                {workMatches.map((work) => (
                  <button key={work.id} onClick={() => openWork(work.id)}>
                    <TcIcon name="works" size={16} />
                    <span>
                      <strong>{work.name}</strong>
                      <small>
                        {work.code} · {work.client_name}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="top-actions">
            <button
              className="notification"
              aria-label="Notificaciones"
              title="Notificaciones"
            >
              <TcIcon name="bell" size={18} />
              <i />
            </button>
            <div className="user-menu">
              <button
                className="user-button"
                onClick={() => setUserMenuOpen((value) => !value)}
                aria-expanded={userMenuOpen}
              >
                <b>{initials}</b>
                <span>
                  <strong>{profile.full_name}</strong>
                  <small>{profile.role}</small>
                </span>
                <i>
                  <TcIcon name="chevron-down" size={15} />
                </i>
              </button>
              {userMenuOpen && (
                <div className="user-dropdown">
                  <button onClick={() => setUserMenuOpen(false)}>Perfil</button>
                  <button onClick={signOut}>Cerrar sesión</button>
                </div>
              )}
            </div>
          </div>
        </header>
        {workId ? (
          <WorkInventoryDetail
            workId={workId}
            role={profile.role}
            onBack={returnFromWork}
            onAction={startWorkAction}
          />
        ) : section === "Inicio" ? (
          <DashboardModule onNavigate={selectSection} onOpenWork={openWork} />
        ) : section === "Alertas" ? (
          <StockAlertsModule onNavigate={selectSection} />
        ) : section === "Productos" ? (
          <ProductModule role={profile.role} onOpenWork={openWork} />
        ) : section === "Depósitos" ? (
          <WarehouseModule role={profile.role} />
        ) : section === "Proveedores" ? (
          <SupplierModule role={profile.role} />
        ) : section === "Obras" ? (
          <WorkModule role={profile.role} onOpenWork={openWork} />
        ) : section === "Movimientos" ? (
          <MovementModule
            role={profile.role}
            preset={movementPreset}
            onOpenWork={openWork}
          />
        ) : section === "Reportes" ? (
          <ReportModule onOpenWork={openWork} />
        ) : section === "Auditoría" &&
          (["ADMIN", "GERENCIA"] as string[]).includes(profile.role) ? (
          <AuditModule />
        ) : section === "Usuarios" && profile.role === "ADMIN" ? (
          <UserModule currentUserId={session.user.id} />
        ) : (
          <ModuleView name={section} />
        )}
      </section>
      <GlobalMovementDetail />
    </main>
  );
}

function ModuleView({ name }: { name: string }) {
  const content: Record<
    string,
    { title: string; text: string; action: string }
  > = {
    Productos: {
      title: "Catálogo de productos",
      text: "Aquí se administrarán SKU, nombres, categorías, unidades, variantes y niveles de stock.",
      action: "Nuevo producto",
    },
    Movimientos: {
      title: "Entradas y salidas",
      text: "Aquí se registrarán compras, salidas a obra, devoluciones, ajustes y transferencias.",
      action: "Nuevo movimiento",
    },
    Obras: {
      title: "Control por obra",
      text: "Aquí se relacionarán materiales, responsables, devoluciones y costos de cada trabajo.",
      action: "Nueva obra",
    },
    Proveedores: {
      title: "Directorio de proveedores",
      text: "Aquí se administrarán datos comerciales, compras y últimos costos.",
      action: "Nuevo proveedor",
    },
    Depósitos: {
      title: "Depósitos y ubicaciones",
      text: "Aquí se definirán depósitos, zonas, estanterías y posiciones físicas.",
      action: "Nuevo depósito",
    },
  };
  const current = content[name];
  return (
    <section className="module-card card">
      <div className="module-head">
        <div>
          <p className="eyebrow">Módulo</p>
          <h2>{current.title}</h2>
        </div>
        <button
          type="button"
          disabled
          title="Se activará con la base de la Fase 2"
        >
          + {current.action}
        </button>
      </div>
      <p>{current.text}</p>
      <div className="empty-state">
        <strong>Módulo abierto correctamente</strong>
        <span>
          La navegación ya funciona. La carga y edición de datos se implementará
          en la Fase 2.
        </span>
      </div>
    </section>
  );
}
