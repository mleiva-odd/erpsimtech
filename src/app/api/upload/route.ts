import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/tenant';
import { supabase } from '@/lib/supabase';
import { getPublicFileUrl } from '@/lib/storage';
import sharp from 'sharp';

// Bucket `products`: público por diseño — las imágenes se renderizan en POS
// y en pantallas de venta visibles a cliente final sin auth intermedio.
// Si llegara a haber un bucket privado (boletas de pago, XMLs FEL, etc.),
// hay que usar `getSignedFileUrl` con expiración 1h. Ver `src/lib/storage.ts`.

export async function POST(req: NextRequest) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;

  try {
    const data = await req.formData();
    const file: File | null = data.get('file') as unknown as File;

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
    }

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: 'Formato inválido. Usa JPG, PNG o WebP.' }, { status: 400 });
    }

    const maxFileSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxFileSizeBytes) {
      return NextResponse.json({ error: 'La imagen excede el máximo permitido de 5 MB.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 1. Procesar y comprimir imagen con Sharp
    // Redimensionar a máx 500x500 y convertir a WebP
    const compressedBuffer = await sharp(buffer)
      .resize(500, 500, {
        fit: 'inside',
        withoutEnlargement: true 
      })
      .webp({ quality: 80 })
      .toBuffer();

    // 2. Generar nombre de archivo único
    const safeBaseName = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-');
    const filename = `${Date.now()}-${safeBaseName || 'image'}.webp`;
    const filepath = `products/${filename}`;

    // 3. Subir a Supabase Storage (Bucket: products)
    const { error: uploadError } = await supabase.storage
      .from('products')
      .upload(filepath, compressedBuffer, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      // Solo el mensaje, no el objeto entero (puede traer keys/headers).
      console.error('upload supabase error:', uploadError?.message ?? 'unknown');
      return NextResponse.json({ error: 'Error al subir la imagen a la nube' }, { status: 500 });
    }

    // 4. Obtener URL pública (bucket products es público por diseño — ver
    //    comentario en el import). Para buckets privados usar getSignedFileUrl.
    const publicUrl = getPublicFileUrl('products', filepath);

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error(
      'upload processing error:',
      error instanceof Error ? error.message : 'unknown',
    );
    return NextResponse.json({ error: 'Fallo al procesar o subir la imagen' }, { status: 500 });
  }
}
