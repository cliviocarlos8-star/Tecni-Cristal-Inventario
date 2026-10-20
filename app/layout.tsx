import type { Metadata, Viewport } from "next";
import "./globals.css";
import LearningProvider from "./onboarding/provider";
import "./onboarding/onboarding.css";
import PwaManager from "./pwa-manager";

export const metadata: Metadata = {
  title: "Tecni Cristal Inventario",
  description: "Sistema interno de inventario, materiales, obras y depósitos de Tecni Cristal.",
  applicationName: "Tecni Cristal",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Tecni Cristal", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/pwa/apple-touch-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#06283b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-PY"><body><LearningProvider>{children}</LearningProvider><PwaManager /></body></html>;
}
