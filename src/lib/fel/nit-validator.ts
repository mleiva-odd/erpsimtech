/**
 * Validador de NIT guatemalteco.
 *
 * Reglas SAT:
 *   - "CF" (case-insensitive) = Consumidor Final. Aceptado hasta cierto
 *     monto. Valor especial.
 *   - NIT regular: dígitos + dígito verificador (último carácter, puede ser
 *     número o letra "K"/"k"). Acepta opcionalmente "-" antes del verificador
 *     para legibilidad (ej. "1234567-8").
 *   - El verificador se calcula como módulo 11 sobre los dígitos previos
 *     ponderados (de izquierda a derecha) por la posición desde el final,
 *     empezando por 2. Si el módulo da 11→0; si da 10→"K".
 *
 * Ejemplos válidos (formato y verificador):
 *   - "CF"
 *   - "12345678" (calcular vc)
 *   - "12345678-9"
 *   - "8989898-K"
 */

const CF = 'CF';

export interface NitValidationResult {
  ok: boolean;
  normalized: string; // forma canónica sin guion, ej "12345678" o "CF"
  error?: string;
}

/**
 * Valida formato + dígito verificador.
 *
 * Returns { ok: true, normalized } si pasa. Si falla devuelve { ok: false,
 * normalized, error } con mensaje legible.
 *
 * NO lanza excepciones (lo dejamos al caller decidir si tirar 400 o intentar
 * fallback a "CF").
 */
export function validateGuatemalanNit(rawNit: string | null | undefined): NitValidationResult {
  if (!rawNit) {
    return { ok: false, normalized: '', error: 'NIT requerido' };
  }

  const trimmed = rawNit.trim().toUpperCase();

  if (trimmed === CF) {
    return { ok: true, normalized: CF };
  }

  // Sin espacios, removemos guion opcional para procesar
  const compact = trimmed.replace(/-/g, '');

  // Mínimo 2 caracteres (1 dígito + 1 verificador). En la práctica los NIT GT
  // son al menos 4 dígitos pero no enforce-amos un mínimo legal porque algunos
  // contribuyentes antiguos tienen NITs cortos.
  if (compact.length < 2) {
    return { ok: false, normalized: compact, error: 'NIT demasiado corto' };
  }

  // Solo dígitos + el último puede ser K. Resto debe ser dígitos.
  const body = compact.slice(0, -1);
  const checker = compact.slice(-1);

  if (!/^\d+$/.test(body)) {
    return { ok: false, normalized: compact, error: 'NIT con caracteres inválidos' };
  }
  if (!/^[\dK]$/.test(checker)) {
    return { ok: false, normalized: compact, error: 'Dígito verificador inválido (esperado dígito o K)' };
  }

  // Algoritmo: cada dígito multiplicado por su posición desde la derecha del
  // cuerpo (excluyendo verificador), comenzando por 2.
  //   digito_n * (longitud_body + 1 - n)  para n=1..longitud_body
  // Equivalente: recorrer body de izq→der con peso (longitud_body + 1).
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[i]);
    const weight = body.length + 1 - i;
    sum += digit * weight;
  }
  const mod = sum % 11;
  const computed = mod === 0 ? 0 : 11 - mod;
  const computedChar = computed === 10 ? 'K' : computed === 11 ? '0' : String(computed);

  if (computedChar !== checker) {
    return {
      ok: false,
      normalized: compact,
      error: `Dígito verificador inválido (calculado: ${computedChar}, recibido: ${checker})`,
    };
  }

  return { ok: true, normalized: compact };
}

/**
 * Conveniencia: true si el NIT es válido o es "CF".
 */
export function isValidNit(rawNit: string | null | undefined): boolean {
  return validateGuatemalanNit(rawNit).ok;
}

/**
 * Conveniencia: true si el valor representa Consumidor Final.
 */
export function isCF(rawNit: string | null | undefined): boolean {
  if (!rawNit) return false;
  return rawNit.trim().toUpperCase() === CF;
}
