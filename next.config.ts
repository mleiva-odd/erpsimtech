import type { NextConfig } from "next";

/**
 * Headers de seguridad aplicados a TODAS las rutas.
 *
 * NOTA: el header Content-Security-Policy NO se setea acá; lo arma el proxy
 * (src/proxy.ts) con un nonce único por request. Esto permite cerrar
 * 'unsafe-inline' en script-src, que era el último vector de XSS abierto.
 *
 * Acá se mantienen solo headers ESTÁTICOS:
 * - HSTS: forzá HTTPS un año, incluyendo subdominios. Solo en producción.
 *   (Vercel impone su propio HSTS de 180 días en su edge; el nuestro
 *   queda como fallback si algún día se cambia de hosting.)
 * - X-Frame-Options DENY: anti-clickjacking (redundante con frame-ancestors
 *   'none' del CSP, pero algunos browsers viejos lo necesitan).
 * - X-Content-Type-Options nosniff: bloquea MIME sniffing.
 * - Referrer-Policy: limita info del referrer al cross-origin.
 * - Permissions-Policy: deshabilita features potentes que el ERP no usa.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : "*.supabase.co";

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()",
  },
];

if (isProd) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  // poweredByHeader: false elimina `X-Powered-By: Next.js` (no le da pistas a atacantes).
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  // Para servir imágenes desde Supabase Storage usando <Image/>.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
      },
    ],
  },
};

export default nextConfig;
