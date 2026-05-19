import type { MetadataRoute } from 'next';

/**
 * Fase 36 · /sitemap.xml dinámico con las rutas públicas (landing + legales).
 *
 * No incluimos rutas autenticadas porque están bloqueadas en robots.ts y
 * además requieren sesión.
 *
 * NEXT_PUBLIC_SITE_URL controla el dominio base. Fallback al dominio de
 * producción conocido.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://erp.simtechgt.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/legal/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/legal/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/legal/support`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
