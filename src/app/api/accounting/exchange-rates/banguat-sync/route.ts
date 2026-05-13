import { NextResponse } from 'next/server';

/**
 * Fase 22b · Stub para sincronización con BANGUAT.
 *
 * Placeholder: aún no implementamos el cliente HTTP al Banco de Guatemala.
 * Devuelve 501 para señalizar a la UI que la operación está pendiente.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Sincronización con BANGUAT aún no implementada.', code: 'NOT_IMPLEMENTED' },
    { status: 501 },
  );
}
