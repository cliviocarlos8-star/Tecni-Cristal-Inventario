"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function PwaManager() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const installed = isStandalone();
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const dismissed = localStorage.getItem("tc-install-dismissed") === "1";
    setIsIos(ios);
    setShowInstall(!installed && !dismissed && ios);

    const online = () => setOffline(false);
    const offlineHandler = () => setOffline(true);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      if (!isStandalone() && localStorage.getItem("tc-install-dismissed") !== "1") setShowInstall(true);
    };
    const installedHandler = () => { setShowInstall(false); setInstallPrompt(null); };
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installedHandler);

    let registration: ServiceWorkerRegistration | undefined;
    let interval = 0;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((value) => {
        registration = value;
        if (registration.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
        registration.addEventListener("updatefound", () => {
          const worker = registration?.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true);
          });
        });
        interval = window.setInterval(() => registration?.update(), 60 * 60 * 1000);
      }).catch(() => undefined);
    }

    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installedHandler);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setShowInstall(false);
      setInstallPrompt(null);
    } else if (isIos) setShowIosHelp(true);
  }

  function dismissInstall() {
    localStorage.setItem("tc-install-dismissed", "1");
    setShowInstall(false);
    setShowIosHelp(false);
  }

  function updateApp() {
    navigator.serviceWorker.getRegistration().then((registration) => registration?.waiting?.postMessage({ type: "SKIP_WAITING" }));
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }

  return <>
    {offline && <div className="pwa-offline-banner" role="status"><strong>Sin conexión</strong><span>El catálogo usa su copia local. El inventario necesita internet para mostrar datos actuales.</span></div>}
    {showInstall && <div className="pwa-install-card"><button className="pwa-install-dismiss" type="button" onClick={dismissInstall} aria-label="Ocultar instalación">×</button><img src="/pwa/icon-192.png" alt="" width="42" height="42" /><span><strong>Instalar Tecni Cristal</strong><small>{isIos ? "Agregar a la pantalla de inicio" : "Acceso rápido como aplicación"}</small></span><button type="button" onClick={install}>Instalar</button></div>}
    {showIosHelp && <div className="pwa-dialog-backdrop" role="presentation" onClick={() => setShowIosHelp(false)}><section className="pwa-dialog" role="dialog" aria-modal="true" aria-label="Instalar en iPhone" onClick={(event) => event.stopPropagation()}><img src="/pwa/icon-192.png" alt="Tecni Cristal" width="64" height="64" /><h2>Instalar en iPhone</h2><ol><li>Abre esta página en Safari.</li><li>Pulsa <strong>Compartir</strong>.</li><li>Elige <strong>Agregar a pantalla de inicio</strong>.</li></ol><button type="button" onClick={dismissInstall}>Entendido</button></section></div>}
    {updateReady && <div className="pwa-update-toast" role="status"><span>Hay una nueva versión disponible</span><button type="button" onClick={updateApp}>Actualizar</button></div>}
  </>;
}
