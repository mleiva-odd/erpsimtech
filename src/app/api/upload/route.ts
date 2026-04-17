import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/tenant';
import { supabase } from '@/lib/supabase';
import sharp from 'sharp';

export async function POST(req: NextRequest) {
  const result = await requireRole('SUPERVISOR');
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
      console.error('Error subiendo a Supabase:', uploadError);
      return NextResponse.json({ error: 'Error al subir la imagen a la nube' }, { status: 500 });
    }

    // 4. Obtener URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('products')
      .getPublicUrl(filepath);

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error('Error procesando la imagen:', error);
    return NextResponse.json({ error: 'Fallo al procesar o subir la imagen' }, { status: 500 });
  }
}
