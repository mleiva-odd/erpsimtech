/**
 * Fase 29 · Helper para fetch del logo de empresa y conversión a Data URL.
 *
 * jsPDF acepta imágenes como Data URLs (data:image/png;base64,...).
 * Este helper hace el fetch del logo (Supabase Storage URL típicamente)
 * y devuelve el Data URL listo para `doc.addImage(...)`.
 *
 * Falla silenciosamente — si el logo no se puede cargar, devuelve null
 * y el PDF se renderea sin logo (no debe romper la generación de la factura).
 */

import { Buffer } from 'node:buffer';

interface FetchLogoOptions {
  /** Timeout para el fetch en ms. Default 5s. */
  timeoutMs?: number;
  /** Máximo tamaño en bytes para evitar logos gigantes. Default 2MB. */
  maxBytes?: number;
}

export async function fetchLogoAsDataUrl(
  logoUrl: string | null | undefined,
  opts: FetchLogoOptions = {},
): Promise<string | null> {
  if (!logoUrl) return null;
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(logoUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'simtech-pdf-generator/1.0' },
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      // Logo demasiado grande — no lo embebemos para no inflar el PDF.
      return null;
    }

    const contentType = res.headers.get('content-type') ?? 'image/png';
    // jsPDF solo acepta PNG, JPEG, WebP. Si el content-type no es uno de
    // esos, defaulteamos a PNG (que cubre los casos más comunes).
    const safeContentType =
      contentType.startsWith('image/png') ||
      contentType.startsWith('image/jpeg') ||
      contentType.startsWith('image/jpg') ||
      contentType.startsWith('image/webp')
        ? contentType
        : 'image/png';

    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${safeContentType};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Devuelve el formato esperado por jsPDF (`PNG`, `JPEG`, `WEBP`) inferido
 * de un Data URL. Default PNG si no se puede detectar.
 */
export function pdfFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
    return 'JPEG';
  }
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}
