import type { MetadataRoute } from 'next';

/**
 * Fase 36 · /robots.txt dinámico.
 *
 * Permite indexar el landing y las páginas legales públicas. Bloquea
 * cualquier ruta autenticada (apps, api, onboarding) y rutas técnicas
 * de Next.js. Sitemap se enlaza desde aquí.
 *
 * NEXT_PUBLIC_SITE_URL (opcional) define el dominio del sitemap. Si no
 * está definida, caemos al dominio de producción conocido. En preview /
 * dev local el sitemap apunta al mismo, lo cual es aceptable porque
 * Google solo lee robots.txt del dominio que crawlea.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://erp.simtechgt.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/legal/'],
        disallow: [
          '/api/',
          '/apps/',
          '/onboarding',
          '/admin/',
          '/_next/',
          '/sessions/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
