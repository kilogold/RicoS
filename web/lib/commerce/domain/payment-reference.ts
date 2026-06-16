import { randomUUID } from "node:crypto";

/**
 * ATH Móvil metadata fields cap reference length at 40 chars.
 * Use a compact UUID-derived reference as ATH source of truth.
 */
export function generateAthMovilPaymentReference(): string {
  return randomUUID().replace(/-/g, "").slice(0, 40);
}
