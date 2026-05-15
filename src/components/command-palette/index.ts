/**
 * Fase 22d-2 · Barrel del Command Palette.
 * Fase 22d-3 · Añade trigger del header + helpers de recientes/entidades.
 */
export { CommandPalette } from './CommandPalette';
export {
  CommandPaletteProvider,
  useCommandPalette,
} from './CommandPaletteProvider';
export { CommandPaletteTrigger } from './CommandPaletteTrigger';
export {
  getAllCommands,
  filterCommandsByPermissions,
  searchCommands,
  scoreCommand,
  pushRecent,
  getRecentCommands,
  buildEntityCommands,
  type Command,
  type CommandCategory,
  type CommandRouter,
  type ScoredCommand,
  type ProductEntity,
  type CustomerEntity,
  type SaleEntity,
} from './commands';
