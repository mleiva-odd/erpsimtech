/**
 * DigifactProvider — stub.
 *
 * Digifact es otro certificador SAT autorizado en Guatemala. Esquema
 * análogo a InfileProvider: requiere credenciales en CompanySettings y la
 * integración real va a vivir acá cuando se contrate.
 */

import type {
  CancelInput,
  CancelResult,
  CertifyInput,
  CertifyResult,
  FelProvider,
} from './types';
import { FelError } from './types';

export interface DigifactProviderConfig {
  apiUser: string;
  apiKey: string;
  certificateUrl?: string | null;
  endpoint?: string;
}

export class DigifactProvider implements FelProvider {
  readonly name = 'DIGIFACT' as const;

  constructor(private readonly config: DigifactProviderConfig) {
    if (!config.apiUser || !config.apiKey) {
      throw new FelError(
        'DigifactProvider requiere felApiUser y felApiKey configurados en CompanySettings.',
        { code: 'DIGIFACT_NO_CREDENTIALS', status: 500 },
      );
    }
    void this.config;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async certify(_input: CertifyInput): Promise<CertifyResult> {
    throw new FelError(
      'DigifactProvider.certify no implementado — pendiente integración con API real.',
      { code: 'DIGIFACT_NOT_IMPLEMENTED', status: 501 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cancel(_input: CancelInput): Promise<CancelResult> {
    throw new FelError(
      'DigifactProvider.cancel no implementado — pendiente integración con API real.',
      { code: 'DIGIFACT_NOT_IMPLEMENTED', status: 501 },
    );
  }
}
