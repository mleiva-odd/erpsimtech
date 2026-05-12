/**
 * API pública del módulo FEL (Fase 16).
 *
 * Consumidores externos deben importar SOLO desde `@/lib/fel`. Los archivos
 * internos (`./mock`, `./infile`, etc.) no deben ser importados directamente
 * por handlers o componentes.
 */

export * from './types';
export { validateGuatemalanNit, isValidNit, isCF } from './nit-validator';
export type { NitValidationResult } from './nit-validator';
export { calculateLineTax, sumTaxLines } from './tax-calc';
export type { CalculateLineTaxInput, TaxLineCalc } from './tax-calc';
export { generateDTE, wrapWithCertification } from './xml-generator';
export { MockProvider } from './mock';
export { InfileProvider } from './infile';
export { DigifactProvider } from './digifact';
export { resolveProvider, __clearProviderCacheForTests } from './factory';
export type { CompanySettingsForFel } from './factory';
export { reserveCorrelativo, formatCorrelativoDisplay } from './series';
export type { ReserveCorrelativoInput, ReservedCorrelativo } from './series';
