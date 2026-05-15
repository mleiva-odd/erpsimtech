/**
 * Helpers puros del MobileNavigation / MobileDrawer.
 *
 * Aislados del .tsx para tests en node sin DOM.
 */

/**
 * Determina si el drawer debe cerrarse al hacer click sobre el elemento.
 * Cierra cuando se clickea un link interno (a[href]) o un botón con data-close-drawer.
 *
 * En el test simulamos un mini-DOM mock con .closest() y .getAttribute().
 */
/**
 * Subset mínimo de `Element` que necesita el helper. Compatible con
 * `HTMLElement` real (que devuelve `Element | null` de `closest`).
 */
interface NavTargetLike {
  closest(selector: string): unknown;
}

export function shouldCloseDrawer(target: NavTargetLike | null): boolean {
  if (!target) return false;
  // Cualquier link con href.
  const link = target.closest('a[href]');
  if (link) return true;
  // Cualquier botón con flag explícito de cerrar.
  const closer = target.closest('[data-close-drawer]');
  if (closer) return true;
  return false;
}
