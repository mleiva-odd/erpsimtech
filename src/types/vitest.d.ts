/**
 * Shim minimal de tipos para `vitest` mientras la dep no está instalada
 * en el sandbox (Fase 14 / mismo patrón que sentry-nextjs.d.ts).
 *
 * Cuando el dueño corre `npm install`, recoge `vitest` declarado en
 * `package.json` y los tipos reales sobreescriben este shim sin cambios
 * adicionales.
 */
declare module 'vitest' {
  type TestFn = () => void | Promise<void>;
  type DescribeFn = (name: string, fn: () => void) => void;
  type ItFn = (name: string, fn: TestFn) => void;
  export const describe: DescribeFn & {
    only: DescribeFn;
    skip: DescribeFn;
  };
  export const it: ItFn & {
    only: ItFn;
    skip: ItFn;
    todo: (name: string) => void;
  };
  export const test: typeof it;
  export const beforeAll: (fn: TestFn) => void;
  export const beforeEach: (fn: TestFn) => void;
  export const afterAll: (fn: TestFn) => void;
  export const afterEach: (fn: TestFn) => void;

  export interface ExpectMatchers<T = unknown> {
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toContain(expected: unknown): void;
    toBeInstanceOf(expected: unknown): void;
    toBeCloseTo(expected: number, precision?: number): void;
    toHaveLength(expected: number): void;
    toThrow(expected?: unknown): void;
    not: ExpectMatchers<T>;
    rejects: ExpectMatchers<T>;
    resolves: ExpectMatchers<T>;
  }
  export function expect<T = unknown>(actual: T, message?: string): ExpectMatchers<T>;
}

declare module 'vitest/config' {
  export function defineConfig(config: unknown): unknown;
}
