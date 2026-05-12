/**
 * Factory que resuelve el `FelProvider` apropiado según la config de la
 * empresa. Usa cache simple por (provider+credenciales-hash) para evitar
 * reconstruir el cliente HTTP en cada request.
 *
 * Reglas:
 *   - `felEnabled=false` → throw `FelError('FEL_DISABLED')`.
 *   - `felProvider='NONE'` → throw `FelError('FEL_DISABLED')`.
 *   - `felProvider='MOCK'` → MockProvider singleton.
 *   - `felProvider='INFILE'` → InfileProvider con credenciales de settings.
 *   - `felProvider='DIGIFACT'` → DigifactProvider con credenciales.
 */

import { MockProvider } from './mock';
import { InfileProvider } from './infile';
import { DigifactProvider } from './digifact';
import { FelError, type FelProvider, type FelProviderType } from './types';

export interface CompanySettingsForFel {
  felEnabled: boolean;
  felProvider: FelProviderType | string;
  felApiUser: string | null;
  felApiKey: string | null;
  felCertificateUrl: string | null;
}

// Cache simple por clave compuesta.
const cache = new Map<string, FelProvider>();
const mockSingleton = new MockProvider();

export function resolveProvider(settings: CompanySettingsForFel): FelProvider {
  if (!settings.felEnabled) {
    throw new FelError(
      'FEL está deshabilitado para esta empresa. Activá felEnabled en Settings.',
      { code: 'FEL_DISABLED', status: 409 },
    );
  }

  const providerName = settings.felProvider as FelProviderType;

  switch (providerName) {
    case 'MOCK':
      return mockSingleton;

    case 'INFILE': {
      const key = `INFILE:${settings.felApiUser ?? ''}:${settings.felApiKey ?? ''}`;
      let cached = cache.get(key);
      if (!cached) {
        cached = new InfileProvider({
          apiUser: settings.felApiUser ?? '',
          apiKey: settings.felApiKey ?? '',
          certificateUrl: settings.felCertificateUrl,
        });
        cache.set(key, cached);
      }
      return cached;
    }

    case 'DIGIFACT': {
      const key = `DIGIFACT:${settings.felApiUser ?? ''}:${settings.felApiKey ?? ''}`;
      let cached = cache.get(key);
      if (!cached) {
        cached = new DigifactProvider({
          apiUser: settings.felApiUser ?? '',
          apiKey: settings.felApiKey ?? '',
          certificateUrl: settings.felCertificateUrl,
        });
        cache.set(key, cached);
      }
      return cached;
    }

    case 'NONE':
    default:
      throw new FelError(
        `Provider FEL no configurado (${providerName}). Elegí MOCK/INFILE/DIGIFACT en Settings.`,
        { code: 'FEL_PROVIDER_NONE', status: 409 },
      );
  }
}

/**
 * Útil para tests: limpia el cache de providers.
 */
export function __clearProviderCacheForTests(): void {
  cache.clear();
}
