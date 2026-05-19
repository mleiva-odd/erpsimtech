/**
 * Fase 48 · Mapeo canónico de errores de NextAuth a mensajes user-facing.
 *
 * Centraliza la lógica que vivía dispersa en el login (substring matching
 * frágil). Mantener acá:
 *
 *   1. Los mensajes raw que lanza `authorize()` en src/lib/auth.ts deben
 *      coincidir EXACTAMENTE con las keys de RAW_ERRORS.
 *   2. Si cambia un mensaje raw, hay que cambiar la key correspondiente
 *      acá y el test detecta el desfasaje.
 *   3. El mensaje del usuario está pensado para no filtrar info — un
 *      atacante no debe saber si el email existe vs si está suspendido.
 *      Por eso muchos casos colapsan al genérico "Credenciales incorrectas".
 *
 * Nunca exponer al usuario el mensaje técnico raw — siempre pasar por
 * mapAuthError(res.error).
 */

interface MappedError {
  /** Texto que ve el usuario. NUNCA contiene info sensible. */
  userMessage: string;
  /** Categoría para analytics/logs. */
  kind:
    | 'rate-limit'
    | 'suspended-company'
    | 'inactive-user'
    | 'invalid-credentials'
    | 'unknown';
}

const FALLBACK: MappedError = {
  userMessage: 'Credenciales incorrectas. Verificá y volvé a intentar.',
  kind: 'invalid-credentials',
};

/**
 * Patrones que matchean fragmentos del mensaje raw retornado por NextAuth.
 * Orden = prioridad: el primer match gana. Los strings son case-insensitive
 * (se comparan en lowercase).
 */
const PATTERNS: Array<{ test: string; map: MappedError }> = [
  {
    test: 'demasiados',
    map: {
      userMessage:
        'Demasiados intentos. Esperá unos minutos antes de volver a probar.',
      kind: 'rate-limit',
    },
  },
  {
    test: 'intentos',
    map: {
      userMessage:
        'Demasiados intentos. Esperá unos minutos antes de volver a probar.',
      kind: 'rate-limit',
    },
  },
  {
    test: 'suspendida',
    map: {
      userMessage: 'La empresa está suspendida. Contactá al administrador.',
      kind: 'suspended-company',
    },
  },
  {
    test: 'inactivo',
    map: {
      userMessage: 'Usuario inactivo. Contactá al administrador.',
      kind: 'inactive-user',
    },
  },
];

/**
 * Convierte un error raw de NextAuth a un mensaje seguro para mostrar al
 * usuario, junto con una categoría para analytics. Si no matchea ningún
 * patrón conocido, cae al genérico (sin filtrar detalles).
 *
 * @param raw  Mensaje retornado en `res.error` de signIn() o el código
 *             "CredentialsSignin" que usa NextAuth como fallback.
 */
export function mapAuthError(raw: string | null | undefined): MappedError {
  if (!raw) return FALLBACK;
  const normalized = raw.toLowerCase();
  for (const { test, map } of PATTERNS) {
    if (normalized.includes(test)) return map;
  }
  return FALLBACK;
}

/**
 * Útil para tests / inspección — expone las keys que el módulo entiende.
 */
export const KNOWN_RAW_PATTERNS = PATTERNS.map((p) => p.test);
