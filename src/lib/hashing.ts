import bcrypt from 'bcryptjs';

/**
 * Cost factor for bcrypt. Centralized so todo el código usa la misma fuerza.
 * 12 es el estándar moderno (≈250-300ms por hash en hardware típico).
 * Para subir más adelante (e.g. a 13), basta con cambiar acá.
 */
export const BCRYPT_ROUNDS = 12;

/**
 * Reglas mínimas para la contraseña de cualquier usuario humano.
 * - 12 caracteres mínimo (alineado a NIST y la mayoría de marcos modernos)
 * - al menos 1 minúscula, 1 mayúscula, 1 dígito y 1 símbolo
 *
 * Si querés flexibilizar para clientes específicos (e.g. cajeros con teclado físico),
 * exponé un `getPasswordPolicy(plan)` desde acá.
 */
export const PASSWORD_MIN_LENGTH = 12;
const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /[0-9]/;
const HAS_SYMBOL = /[^A-Za-z0-9]/;

export interface PasswordValidationResult {
  ok: boolean;
  errors: string[];
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (!HAS_LOWER.test(password)) errors.push('Debe incluir al menos una letra minúscula.');
  if (!HAS_UPPER.test(password)) errors.push('Debe incluir al menos una letra mayúscula.');
  if (!HAS_DIGIT.test(password)) errors.push('Debe incluir al menos un dígito.');
  if (!HAS_SYMBOL.test(password)) errors.push('Debe incluir al menos un símbolo (e.g. !@#$%).');
  return { ok: errors.length === 0, errors };
}

/**
 * Hashea una contraseña con la política activa de la app.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Compara una contraseña con su hash. Wrapper trivial para no importar bcrypt en handlers.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
