import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

/**
 * Error tipado para problemas de negocio. Usalo en los handlers cuando
 * necesités cortar la ejecución con un código HTTP específico:
 *
 *   throw new ApiError(409, 'Stock insuficiente', { available: 3 });
 *
 * El handler externo (apiResponse / handleApiError) lo convierte en
 * el JSON correcto. Cualquier otra excepción se trata como 500.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Mapea errores Prisma conocidos a respuestas HTTP semánticas y mensajes
 * que NO filtran detalles internos (no nombres de columnas, no constraint
 * names crudos). El mensaje puede ser sobreescrito por handler concreto.
 */
function mapPrismaError(
  error: Prisma.PrismaClientKnownRequestError,
): { status: number; message: string; details?: unknown } {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      return {
        status: 409,
        message: 'Ya existe un registro con esos datos únicos.',
        details: { fields: error.meta?.target ?? null },
      };
    case 'P2003':
      // Foreign key constraint
      return {
        status: 409,
        message:
          'No se puede completar la operación porque depende de otros registros.',
      };
    case 'P2025':
      // Not found (where clause matched 0 rows on update/delete)
      return {
        status: 404,
        message: 'Recurso no encontrado.',
      };
    case 'P2014':
      // Required relation violation (sub-records exist)
      return {
        status: 409,
        message:
          'No se puede eliminar porque tiene historial o registros dependientes.',
      };
    default:
      return {
        status: 500,
        message: 'Error de base de datos.',
      };
  }
}

/**
 * Convierte cualquier error capturado en un NextResponse con JSON estándar.
 * Loguea internamente para que la persona en consola/Sentry pueda investigar
 * sin exponer al cliente datos técnicos sensibles.
 */
export function handleApiError(error: unknown, requestPath?: string): NextResponse {
  // 1. Errores de validación Zod
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Datos inválidos',
        details: error.flatten(),
      },
      { status: 400 },
    );
  }

  // 2. ApiError lanzados a propósito por el handler
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
      { status: error.status },
    );
  }

  // 3. Errores Prisma conocidos
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(error);
    console.error(`[api${requestPath ? ' ' + requestPath : ''}] prisma ${error.code}:`, error.message);
    return NextResponse.json(
      {
        error: mapped.message,
        ...(mapped.details ? { details: mapped.details } : {}),
      },
      { status: mapped.status },
    );
  }

  // 4. Errores Prisma de validación (e.g. tipos mal pasados desde código)
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error(`[api${requestPath ? ' ' + requestPath : ''}] prisma validation:`, error.message);
    return NextResponse.json(
      { error: 'Error interno de validación de datos.' },
      { status: 500 },
    );
  }

  // 5. Cualquier otro error: 500 genérico, NO filtrar el mensaje al cliente
  console.error(
    `[api${requestPath ? ' ' + requestPath : ''}] unhandled:`,
    error instanceof Error ? error.stack ?? error.message : error,
  );
  return NextResponse.json(
    { error: 'Error interno del servidor.' },
    { status: 500 },
  );
}
