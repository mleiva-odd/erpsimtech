import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Health check endpoint público (sin auth).
//
// Sirve para tres cosas:
//   1. Liveness probe externa (uptime monitoring, Vercel, etc.).
//   2. Cron anti-pausa de Supabase FREE: si la DB no recibe queries en
//      7 días, Supabase la pausa. El workflow .github/workflows/keep-alive.yml
//      hace curl a este endpoint cada ~6 días para evitar la pausa.
//   3. Smoke tests post-deploy.
//
// Respuesta:
//   200 + { status: 'ok', db: 'up', ts } cuando todo bien.
//   503 + { status: 'degraded', db: 'down', error } si falla la DB.
//
// NO exponemos detalles de versión, schema ni secretos — sólo "up/down".

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const ts = new Date().toISOString();
  try {
    // SELECT 1: query mínima para validar que la conexión está viva.
    // $queryRaw, no $queryRawUnsafe — no hay user input.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: 'ok', db: 'up', ts },
      { status: 200 },
    );
  } catch (error) {
    // No exponemos el mensaje del error al cliente (puede tener
    // info del DSN). Solo log server-side.
    console.error('[health] DB check failed:', error);
    return NextResponse.json(
      { status: 'degraded', db: 'down', ts },
      { status: 503 },
    );
  }
}
