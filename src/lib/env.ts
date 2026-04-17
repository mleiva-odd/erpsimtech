const cache = new Map<string, string>();

export function requireEnv(name: string): string {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }

  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  cache.set(name, value);
  return value;
}
