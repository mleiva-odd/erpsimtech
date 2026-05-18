import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { EnvBanner } from "@/components/EnvBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIMTECH ERP — Plataforma de Gestión Empresarial",
  description: "ERP multi-sucursal para operaciones, inventario, ventas, tesorería, recursos humanos y reportes en tiempo real.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col bg-slate-50">
        <EnvBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
