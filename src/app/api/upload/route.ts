import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/tenant';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;

  const data = await req.formData();
  const file: File | null = data.get('file') as unknown as File;

  if (!file) {
    return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Sanitizar el nombre del archivo y agregar timestamp
  const filename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const uploadDir = path.join(process.cwd(), 'public/uploads/products');

  try {
    await mkdir(uploadDir, { recursive: true });
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, buffer);
    
    // Retornamos la ruta pública
    return NextResponse.json({ url: `/uploads/products/${filename}` });
  } catch (error) {
    console.error('Error guardando el archivo:', error);
    return NextResponse.json({ error: 'Fallo al guardar la imagen en el servidor' }, { status: 500 });
  }
}
