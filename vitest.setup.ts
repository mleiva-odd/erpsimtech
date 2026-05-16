/**
 * Fase 25-1 · Setup global de tests.
 *
 * - Carga matchers de `@testing-library/jest-dom` (toBeInTheDocument, etc.)
 *   solo si el environment es jsdom; en node se ignora silenciosamente.
 * - Punto de extensión para mocks globales que apliquen a TODOS los tests
 *   (ej: silenciar console.warn de React act() en jsdom).
 */

// jest-dom matchers (cargados condicionalmente — sin DOM no hacen nada).
import '@testing-library/jest-dom/vitest';
