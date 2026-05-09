import type { NextConfig } from "next";

/**
 * Headers de seguridad aplicados a TODAS las rutas (incluida la API).
 *
 * - CSP: estricta en producción, más laxa en dev por necesidad de eval/inline scripts
 *   de Next.js en HMR. Si agregás scripts/imágenes externas (Stripe, Google Tag,
 *   Supabase Storage de otro dominio, etc.) hay que ampliar acá.
 * - HSTS: forzá HTTPS un año, incluyendo subdominios. Solo tiene sentido en producción.
 * - frame-ancestors 'none' equivale a X-Frame-Options: DENY (anti-clickjacking).
 * - Permissions-Policy: deshabilita features potentes que el ERP no usa.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : "*.supabase.co";

const isProd = process.env.NODE_ENV === "production";

const cspDirectives = [
  "default-src 'self'",
  // 'unsafe-inline' es necesario para Next.js: el framework inyecta scripts
  // inline (__NEXT_DATA__, hidratación de Server Components, self.__next_f).
  // Sin esto la app no hidrata en el browser y se ven páginas estáticas vacías.
  // 'unsafe-eval' solo en dev (HMR). El siguiente paso para cerrar más es
  // mover a nonces por request — requiere middleware que setee un nonce y
  // lo pase al <head>. TODO: Sprint 2.C.3.
  isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // 'unsafe-inline' en estilos: Tailwind/recharts inyectan estilos inline.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://${supabaseHost}`,
  "font-src 'self' data:",
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
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
