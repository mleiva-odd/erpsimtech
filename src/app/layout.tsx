import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIMTECH POS — Sistema de Punto de Venta",
  description: "Sistema profesional de punto de venta para negocios modernos. Gestión de inventario, ventas y reportes en tiempo real.",
  icons: {
    icon: "/logo.png",
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
