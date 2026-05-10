import type { NextConfig } from "next";

/**
 * Headers de seguridad aplicados a TODAS las rutas.
 *
 * Decisión Sprint 2.C.3: usamos CSP con 'unsafe-inline' en script-src.
 * El plan de mover a nonces (vivo en docs/audits/phase-2c2-rls-policies.md
 * como "futuro") requiere forzar dynamic rendering en todas las páginas
 * (incluyendo /login que hoy es estática), lo que rompió producción
 * cuando se intentó. Los nonces se pueden retomar cuando haya tiempo
 * para refactor + testing en preview environment.
 *
 * Mitigación del riesgo de XSS via 'unsafe-inline':
 * - React auto-escapa output por default (sin dangerouslySetInnerHTML).
 * - Validación Zod en endpoints (Sprint 2.B + 2.B.2 + Phase 4).
 * - frame-ancestors 'none' bloquea clickjacking (XSS via iframe ya inutil).
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : "*.supabase.co";

const isProd = process.env.NODE_ENV === "production";

const cspDirectives = [
  "default-src 'self'",
  // 'unsafe-inline' es necesario porque Next.js inyecta scripts inline
  // (__NEXT_DATA__, hidratación de Server Components, self.__next_f).
  // 'unsafe-eval' solo en dev (HMR de React).
  // Dominios externos permitidos:
  //   - va.vercel-scripts.com: Vercel Web Analytics / Speed Insights.
  //   - static.cloudflareinsights.com: beacon de Cloudflare Web Analytics
  //     (Cloudflare lo auto-inyecta cuando el dominio está detrás de su CDN).
  isProd
    ? "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://static.cloudflareinsights.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://static.cloudflareinsights.com",
  // Tailwind y recharts inyectan estilos inline. Google Fonts permitido
  // para la fuente Inter cargada vía CSS @import.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://${supabaseHost}`,
  // Beacons de telemetría:
  //   - vitals.vercel-insights.com / va.vercel-scripts.com: Vercel Analytics.
  //   - cloudflareinsights.com: Cloudflare Web Analytics.
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://vitals.vercel-insights.com https://va.vercel-scripts.com https://cloudflareinsights.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives },
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
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

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
