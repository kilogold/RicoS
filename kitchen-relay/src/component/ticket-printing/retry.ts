import type { PrintRetryOptions, PrinterAdapter } from "./types";
import { sleep } from "@ricos/shared";

export async function printWithRetries(
  adapter: PrinterAdapter,
  text: string,
  retries: PrintRetryOptions,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries.maxAttempts; attempt += 1) {
    try {
      await adapter.print(text);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < retries.maxAttempts - 1) {
        const delay = retries.initialDelayMs * 2 ** attempt;
        await sleep(delay);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
