import { describe, it, expect } from 'vitest';
import { shouldCloseDrawer } from '../mobile-nav.helpers';

/**
 * Fase 22a · Tests mínimos del MobileNavigation.
 *
 * El componente JSX se valida con typecheck. Aquí sólo validamos la lógica
 * pura de "cuándo cerrar el drawer al hacer click dentro".
 */

// Mini-fake del HTMLElement con sólo lo que la función usa.
function makeTarget(opts: {
  href?: string;
  closeAttr?: boolean;
  parentHref?: string;
  parentClose?: boolean;
}): { closest(sel: string): { tagName: string } | null } {
  return {
    closest(selector: string) {
      if (selector === 'a[href]' && (opts.href || opts.parentHref)) {
        return { tagName: 'A' };
      }
      if (selector === '[data-close-drawer]' && (opts.closeAttr || opts.parentClose)) {
        return { tagName: 'BUTTON' };
      }
      return null;
    },
  };
}

describe('MobileNavigation · shouldCloseDrawer', () => {
  it('cierra al clickear un link directo', () => {
    expect(shouldCloseDrawer(makeTarget({ href: '/dashboard' }))).toBe(true);
  });

  it('cierra al clickear un link ancestro', () => {
    expect(shouldCloseDrawer(makeTarget({ parentHref: '/pos' }))).toBe(true);
  });

  it('cierra al clickear un elemento con data-close-drawer', () => {
    expect(shouldCloseDrawer(makeTarget({ closeAttr: true }))).toBe(true);
  });

  it('no cierra si el target no es un link ni close-trigger', () => {
    expect(shouldCloseDrawer(makeTarget({}))).toBe(false);
  });

  it('no cierra para target nulo', () => {
    expect(shouldCloseDrawer(null)).toBe(false);
  });
});
