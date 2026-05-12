/**
 * Re-export shim — Fase 14.
 *
 * Antes este archivo contenía el helper single-line `createAccountingEntry`
 * y las constantes `SYSTEM_CATEGORIES`. La Fase 14 reemplazó ese sistema
 * por partida doble en `src/lib/accounting/` (directorio). Este archivo
 * sobrevive como bridge para que los imports `from '@/lib/accounting'`
 * resuelvan correctamente al directorio en TypeScript moduleResolution
 * (que prefiere `.ts` sobre `/index.ts` en muchos casos).
 *
 * Toda la API pública vive en `./accounting/index.ts`.
 */
export {
  ACCOUNTS,
  createJournalEntry,
  postJournalEntry,
  reverseJournalEntry,
  JournalError,
  seedChartOfAccounts,
  initializeChartOfAccounts,
  ensureAccountingPeriod,
  CHART_OF_ACCOUNTS_SEED,
} from './accounting/index';

export type {
  AccountCode,
  CreateJournalEntryInput,
  JournalLineInput,
} from './accounting/index';
