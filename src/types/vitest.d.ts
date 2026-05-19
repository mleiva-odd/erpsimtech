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
    toThrowError(expected?: unknown): void;
    toMatch(expected: RegExp | string): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    not: ExpectMatchers<T>;
    rejects: ExpectMatchers<T>;
    resolves: ExpectMatchers<T>;
  }
  export function expect<T = unknown>(actual: T, message?: string): ExpectMatchers<T>;

  // Mínimo de `vi` para mocks/spies/timers. Tipos reales del paquete
  // sobrescriben este shim cuando vitest está instalado.
  interface MockInstance<TArgs extends unknown[] = unknown[], TReturn = unknown> {
    (...args: TArgs): TReturn;
    mockReturnValue: (value: TReturn) => MockInstance<TArgs, TReturn>;
    mockResolvedValue: (value: Awaited<TReturn>) => MockInstance<TArgs, TReturn>;
    mockRejectedValue: (value: unknown) => MockInstance<TArgs, TReturn>;
    mockImplementation: (
      fn: (...args: TArgs) => TReturn,
    ) => MockInstance<TArgs, TReturn>;
    mockReset: () => void;
    mockClear: () => void;
  }

  export const vi: {
    fn<TArgs extends unknown[] = unknown[], TReturn = unknown>(
      impl?: (...args: TArgs) => TReturn,
    ): MockInstance<TArgs, TReturn>;
    mock(moduleName: string, factory?: () => unknown): void;
    unmock(moduleName: string): void;
    resetModules(): void;
    resetAllMocks(): void;
    clearAllMocks(): void;
    spyOn<T, K extends keyof T>(obj: T, method: K): MockInstance;
    stubEnv(name: string, value: string): void;
    unstubAllEnvs(): void;
    useFakeTimers(): void;
    useRealTimers(): void;
    advanceTimersByTime(ms: number): void;
    waitFor<T>(fn: () => T | Promise<T>, options?: unknown): Promise<T>;
  };
}

declare module 'vitest/config' {
  export function defineConfig(config: unknown): unknown;
}
