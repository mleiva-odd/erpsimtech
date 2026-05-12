/**
 * MockProvider FEL — implementa `FelProvider` sin llamar a un servicio real.
 *
 * Útil para:
 *   - Desarrollo y testing local.
 *   - Demos de venta.
 *   - Staging hasta que se contrate Infile/Digifact.
 *
 * Garantías:
 *   - 100% determinístico a partir del `internalId`. Llamar 2× con el mismo
 *     input retorna el mismo UUID/autorización/hash. Útil para tests E2E.
 *   - XML construido vía `generateDTE` (mismo helper que usarían los providers
 *     reales) + bloque `<Certificacion>` con datos del "certificador" Mock.
 *   - Nunca falla en `certify` (responde OK 100% del tiempo). Para simular
 *     rechazos en tests, se puede inyectar un provider custom directamente.
 */

import { createHash } from 'node:crypto';
import type {
  CancelInput,
  CancelResult,
  CertifyInput,
  CertifyResult,
  FelProvider,
} from './types';
import { generateDTE, wrapWithCertification } from './xml-generator';

const MOCK_CERTIFICADOR_NIT = '00000000';
const MOCK_CERTIFICADOR_NOMBRE = 'SIMTECH MOCK CERTIFICADOR';

function deterministicUuid(input: string): string {
  // Genero un UUID v4-like derivado del SHA-256 del input. Es estable por
  // input pero no colisiona con UUIDs reales de SAT (prefijo fijo "MOCK").
  const hash = createHash('sha256').update(input).digest('hex');
  return [
    'MOCK',
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 28),
  ].join('-').toUpperCase();
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 40).toUpperCase();
}

export class MockProvider implements FelProvider {
  readonly name = 'MOCK' as const;

  async certify(input: CertifyInput): Promise<CertifyResult> {
    // Validación mínima local antes de "certificar":
    if (input.items.length === 0) {
      return {
        ok: false,
        code: 'NO_ITEMS',
        message: 'El DTE debe tener al menos un ítem.',
      };
    }

    // Determinismo: el UUID se deriva del internalId + tipo + correlativo.
    const seed = `${input.internalId}|${input.type}|${input.seriePrefix}|${input.numero}`;
    const uuid = deterministicUuid(seed);
    const autorizacion = uuid; // En SAT real es distinto al UUID; acá lo aliasamos para Mock.
    const fechaCertificacion = input.fechaEmision; // Mock usa la fecha de emisión.

    const xmlEmision = generateDTE(input);
    const xmlFirmado = wrapWithCertification(xmlEmision, {
      nitCertificador: MOCK_CERTIFICADOR_NIT,
      nombreCertificador: MOCK_CERTIFICADOR_NOMBRE,
      numeroAutorizacion: autorizacion,
      fechaCertificacion,
    });

    const hashCertificacion = deterministicHash(xmlFirmado);

    return {
      ok: true,
      uuid,
      autorizacion,
      fechaCertificacion,
      hashCertificacion,
      xmlFirmado,
      providerName: 'MOCK',
      providerResponseRaw: {
        provider: 'MOCK',
        uuid,
        autorizacion,
        deterministic: true,
      },
    };
  }

  async cancel(input: CancelInput): Promise<CancelResult> {
    if (!input.uuid) {
      return {
        ok: false,
        errorCode: 'UUID_REQUIRED',
        errorMessage: 'UUID del DTE original es requerido para anular.',
      };
    }
    return {
      ok: true,
      uuid: deterministicUuid(`${input.uuid}|CANCEL`),
      fechaAnulacion: input.fechaAnulacion,
      providerResponseRaw: {
        provider: 'MOCK',
        action: 'CANCEL',
        originalUuid: input.uuid,
        motivo: input.motivoAnulacion,
      },
    };
  }
}
