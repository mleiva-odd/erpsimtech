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
  // 'unsafe-inline' y 'unsafe-eval' solo en dev (Next/HMR los necesita).
  // En prod scripts solo desde el mismo origen.
  isProd
    ? "script-src 'self'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // 'unsafe-inline' en estilos: Tailwind/recharts inyectan estilos inline.
  // Si querés cerrarlo más, se puede pasar a nonces, pero eso requiere cambios
  // en el render de Next.
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
