/**
 * InfileProvider — stub.
 *
 * Infile S.A. (https://infile.com.gt/) es uno de los certificadores
 * autorizados por SAT en Guatemala. Para activar este provider se requiere:
 *   1. Contrato con Infile.
 *   2. Credenciales API (`felApiUser`, `felApiKey`) cifradas at-rest en
 *      `CompanySettings`.
 *   3. URL del certificado de firma (`felCertificateUrl`).
 *
 * Mientras tanto, este provider lanza un error explícito si se invoca.
 */

import type {
  CancelInput,
  CancelResult,
  CertifyInput,
  CertifyResult,
  FelProvider,
} from './types';
import { FelError } from './types';

export interface InfileProviderConfig {
  apiUser: string;
  apiKey: string;
  certificateUrl?: string | null;
  /** Endpoint base de Infile (sandbox vs producción). */
  endpoint?: string;
}

export class InfileProvider implements FelProvider {
  readonly name = 'INFILE' as const;

  constructor(private readonly config: InfileProviderConfig) {
    // Validación temprana: si no hay credenciales, mejor fallar al construir
    // que al primer certify.
    if (!config.apiUser || !config.apiKey) {
      throw new FelError(
        'InfileProvider requiere felApiUser y felApiKey configurados en CompanySettings.',
        { code: 'INFILE_NO_CREDENTIALS', status: 500 },
      );
    }
    void this.config;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async certify(_input: CertifyInput): Promise<CertifyResult> {
    throw new FelError(
      'InfileProvider.certify no implementado — pendiente integración con API real.',
      { code: 'INFILE_NOT_IMPLEMENTED', status: 501 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cancel(_input: CancelInput): Promise<CancelResult> {
    throw new FelError(
      'InfileProvider.cancel no implementado — pendiente integración con API real.',
      { code: 'INFILE_NOT_IMPLEMENTED', status: 501 },
    );
  }
}
