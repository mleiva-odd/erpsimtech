import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { EnvBanner } from "@/components/EnvBanner";
import "./globals.css";

/**
 * NEXT_PUBLIC_SITE_URL controla el dominio canónico usado para metadataBase,
 * Open Graph y Twitter Card. Fallback al dominio de producción conocido.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://erp.simtechgt.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SIMTECH ERP — Sistema ERP & POS para PYMEs en Guatemala",
    template: "%s · SIMTECH ERP",
  },
  description:
    "ERP completo en la nube para pymes guatemaltecas: POS, inventario, contabilidad, ventas, facturación electrónica (FEL) y planilla GT. Probá gratis 30 días.",
  applicationName: "SIMTECH ERP",
  authors: [{ name: "SIMTECH Guatemala" }],
  generator: "Next.js",
  keywords: [
    "ERP Guatemala",
    "POS Guatemala",
    "facturación electrónica",
    "FEL",
    "planilla Guatemala",
    "inventario",
    "contabilidad pymes",
    "sistema empresarial",
    "SAT",
  ],
  category: "business",
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    locale: "es_GT",
    siteName: "SIMTECH ERP",
    title: "SIMTECH ERP — Sistema ERP & POS para PYMEs en Guatemala",
    description:
      "Plataforma cloud todo-en-uno: POS, inventario, contabilidad, facturación electrónica y planilla. Setup en horas, soporte en español.",
    url: "/",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "SIMTECH ERP",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "SIMTECH ERP — Sistema ERP & POS para PYMEs en Guatemala",
    description:
      "ERP cloud todo-en-uno para pymes guatemaltecas. POS, inventario, FEL y planilla.",
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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
