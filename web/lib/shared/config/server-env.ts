/** Server/runtime: looks up `process.env` by name (do not use for `NEXT_PUBLIC_*` in client bundles). */
export function requiredEnv(name: string): string;
/**
 * Client-safe: pass a single `{ ENV_NAME: process.env.ENV_NAME }` entry so the bundler
 * can inline `NEXT_PUBLIC_*` values; the key becomes the variable name in errors.
 */
export function requiredEnv<const K extends string>(
  env: Record<K, string | undefined>,
): string;
export function requiredEnv(
  nameOrEnv: string | Record<string, string | undefined>,
): string {
  if (typeof nameOrEnv === "string") {
    const value = process.env[nameOrEnv]?.trim();
    if (!value) {
      throw new Error(`Missing required environment variable: ${nameOrEnv}`);
    }
    return value;
  }

  const entries = Object.entries(nameOrEnv);
  if (entries.length !== 1) {
    throw new Error("requiredEnv: expected exactly one environment variable");
  }

  const [name, raw] = entries[0]!;
  const value = raw?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
