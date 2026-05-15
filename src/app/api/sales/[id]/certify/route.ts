/**
 * POST /api/sales/:id/certify  · Fase 22c-2
 *
 * Alias semántico del endpoint canónico `/api/fel/certify/:saleId`. Existe
 * para que la UI de detalle de venta pueda referirse a la acción FEL como
 * "una acción sobre la Sale" sin tener que conocer el routing del módulo FEL.
 *
 * No duplica lógica: re-exporta el handler `POST` original. Cualquier cambio
 * en la lógica de certificación se hace en un único lugar (api/fel/certify).
 *
 * El handler original espera `params.saleId`; este endpoint recibe `params.id`,
 * así que adaptamos el shape antes de delegar.
 */

import type { NextRequest } from 'next/server';
import { POST as certifyByFel } from '@/app/api/fel/certify/[saleId]/route';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return certifyByFel(req, { params: Promise.resolve({ saleId: id }) });
}
