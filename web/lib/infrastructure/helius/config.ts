import { requiredEnv } from "@/lib/shared/config/server-env";

export function getHeliusApiKey(): string {
  return requiredEnv("HELIUS_API_KEY");
}
