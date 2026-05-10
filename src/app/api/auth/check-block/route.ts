import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkLoginRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Endpoint público que reporta si el rate limit está bloqueando un (email, IP).
 *
 * Razón de existir: NextAuth v4 con CredentialsProvider enmascara el
 * mensaje real lanzado en authorize() como el código genérico "CredentialsSignin"
 * cuando se llama signIn con redirect:false. La UI no puede distinguir entre
 * "password incorrecta" y "estás bloqueado por rate limit". Este endpoint le
 * permite al cliente preguntar explícitamente.
 *
 * No filtra info adicional: si un atacante hace login fallido, ya sabe que
 * está fallando; saber además si el server lo está rate-limiting no le da
 * ninguna ventaja extra.
 */

const Schema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ blocked: false });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    // Email malformado: tratamos como "no bloqueado" para no filtrar info.
    return NextResponse.json({ blocked: false });
  }

  const ip = getClientIp(req);
  const result = await checkLoginRateLimit(parsed.data.email, ip);

  return NextResponse.json({ blocked: result.blocked });
}
