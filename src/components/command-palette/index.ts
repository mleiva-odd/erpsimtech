/**
 * Fase 22d-2 · Barrel del Command Palette.
 */
export { CommandPalette } from './CommandPalette';
export {
  CommandPaletteProvider,
  useCommandPalette,
} from './CommandPaletteProvider';
export {
  getAllCommands,
  filterCommandsByPermissions,
  searchCommands,
  scoreCommand,
  type Command,
  type CommandCategory,
  type CommandRouter,
  type ScoredCommand,
} from './commands';
