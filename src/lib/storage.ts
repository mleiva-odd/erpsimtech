import { supabase } from '@/lib/supabase';

// Fase 13 — helpers centralizados de Supabase Storage.
//
// Política:
// - Archivos sensibles (boletas de pago, XML certificados FEL, reportes
//   contables exportados, contratos): bucket privado + signed URLs con
//   expiración corta (1h).
// - Archivos públicos por diseño (logo de empresa en factura impresa,
//   imágenes de catálogo expuestas en POS y al cliente final): bucket
//   `products` se mantiene público porque las imágenes deben servirse
//   con cache CDN sin auth. Documentado en
//   docs/audits/phase-13-completion.md.
//
// Este módulo evita que cada handler llame directamente a
// `supabase.storage.from(...).createSignedUrl(...)` y olvide setear el TTL.

export const SIGNED_URL_DEFAULT_TTL_SECONDS = 3600; // 1 hora

/**
 * Devuelve una URL firmada para acceder a un archivo privado.
 * Lanza si el path no existe o si el bucket está mal configurado.
 *
 * El TTL es corto a propósito: cada vista del archivo regenera la URL.
 * Si necesitás un link compartible más largo (ej. cliente externo), usá
 * `expiresInSeconds` explícito pero con criterio (max 24h recomendado).
 */
export async function getSignedFileUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number = SIGNED_URL_DEFAULT_TTL_SECONDS,
): Promise<string> {
  if (!bucket || !path) {
    throw new Error('getSignedFileUrl: bucket y path son requeridos');
  }
  if (expiresInSeconds <= 0 || expiresInSeconds > 86_400) {
    // Defensive: 24h máximo absoluto para evitar links eternos.
    throw new Error(
      'getSignedFileUrl: expiresInSeconds debe estar entre 1 y 86400 (24h)',
    );
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    // No exponemos detalles del provider — pueden filtrar config.
    throw new Error(
      `No se pudo generar URL firmada para "${bucket}/${path}"`,
    );
  }

  return data.signedUrl;
}

/**
 * Convierte una lista de paths en URLs firmadas en batch. Útil para
 * componer respuestas de listado (ej. tabla de empleados con boletas).
 *
 * Si un path falla, lo marca como `null` en vez de fallar todo el batch
 * — eso evita que un solo archivo corrupto rompa un listado entero.
 */
export async function getSignedFileUrls(
  bucket: string,
  paths: string[],
  expiresInSeconds: number = SIGNED_URL_DEFAULT_TTL_SECONDS,
): Promise<Array<{ path: string; url: string | null }>> {
  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        const url = await getSignedFileUrl(bucket, path, expiresInSeconds);
        return { path, url };
      } catch {
        return { path, url: null };
      }
    }),
  );
  return results;
}

/**
 * URL pública (no firmada) para buckets explícitamente públicos.
 *
 * SOLO para buckets que el dueño marcó como públicos a sabiendas:
 *   - `products`: imágenes de catálogo (se renderizan en POS y a cliente
 *     final sin login intermedio; cache CDN amigable).
 *
 * Si dudás si tu caso aplica: NO uses esto. Usá `getSignedFileUrl`.
 */
export function getPublicFileUrl(bucket: string, path: string): string {
  if (!bucket || !path) {
    throw new Error('getPublicFileUrl: bucket y path son requeridos');
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Lista de buckets considerados "públicos por diseño" a 2026-05-11.
 * Si agregás un bucket privado nuevo, NO lo agregues acá; usá
 * `getSignedFileUrl` en su consumo.
 */
export const PUBLIC_BUCKETS = ['products'] as const;
export type PublicBucket = (typeof PUBLIC_BUCKETS)[number];
