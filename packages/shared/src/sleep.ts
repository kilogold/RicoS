/** Resolves after `ms` milliseconds (browser and Node). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
