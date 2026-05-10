/**
 * Logger estructurado mínimo, sin dependencias externas.
 *
 * Diseño:
 * - JSON en producción (parseable por Vercel logs / Logtail / Datadog).
 * - Texto legible en desarrollo.
 * - Request ID por contexto (cuando se pasa explícitamente).
 * - Sin PII obvia: si se loguea un objeto que tiene `password`, `token`,
 *   `apiKey`, `secret`, `authorization`, esos campos se reemplazan con
 *   "[REDACTED]" automáticamente.
 *
 * Por qué no pino/winston: agregar una dependencia para esto cuesta más
 * que escribirlo. Cuando lleguemos a Sentry/Logtail (Phase 6 completa),
 * se reemplaza esta capa con un transport oficial.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const ACTIVE_LEVEL: Level =
  (process.env.LOG_LEVEL as Level | undefined) ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'pwd',
  'token',
  'apikey',
  'api_key',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  'creditcard',
  'card_number',
  'cvv',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  // Errores: serializar message + stack + cause
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause !== undefined ? { cause: redact(value.cause, depth + 1) } : {}),
    };
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[ACTIVE_LEVEL]) return;

  const safe = meta ? (redact(meta) as Record<string, unknown>) : undefined;

  if (process.env.NODE_ENV === 'production') {
    // JSON line — fácil de parsear por agregadores
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      message,
      ...(safe ?? {}),
    });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  } else {
    // Dev: legible. Errores van a stderr.
    const prefix = `[${level.toUpperCase()}]`;
    if (safe) {
      if (level === 'error') console.error(prefix, message, safe);
      else if (level === 'warn') console.warn(prefix, message, safe);
      else console.log(prefix, message, safe);
    } else {
      if (level === 'error') console.error(prefix, message);
      else if (level === 'warn') console.warn(prefix, message);
      else console.log(prefix, message);
    }
  }
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  /**
   * Devuelve un logger con contexto adicional fijo (request id, user id,
   * etc.) que se mergea en cada call.
   */
  child(context: Record<string, unknown>): Logger;
}

function makeLogger(baseContext: Record<string, unknown> = {}): Logger {
  const merge = (meta?: Record<string, unknown>) =>
    meta || Object.keys(baseContext).length
      ? { ...baseContext, ...(meta ?? {}) }
      : undefined;

  return {
    debug: (message, meta) => emit('debug', message, merge(meta)),
    info: (message, meta) => emit('info', message, merge(meta)),
    warn: (message, meta) => emit('warn', message, merge(meta)),
    error: (message, meta) => emit('error', message, merge(meta)),
    child: (context) => makeLogger({ ...baseContext, ...context }),
  };
}

export const logger: Logger = makeLogger();

/**
 * Helper conveniente para crear un logger ligado a un request HTTP.
 * Pasale el request y un identificador (usar el UUID de NextRequest si
 * está disponible, o uno generado).
 */
export function loggerForRequest(meta: {
  requestId?: string;
  path?: string;
  method?: string;
  userId?: string;
  companyId?: string;
}): Logger {
  return logger.child(meta);
}
