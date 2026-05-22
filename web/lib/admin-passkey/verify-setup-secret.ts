import { ADMIN_SETUP_SECRET } from "@/lib/admin-passkey/config";
import compare from "tsscmp";

export function verifyAdminSetupSecret(provided: string | null | undefined): boolean {
  const secret = ADMIN_SETUP_SECRET;
  if (!secret || typeof provided !== "string") {
    return false;
  }
  const token = provided.trim();
  if (!token) return false;
  return compare(token, secret);
}

export function isAdminSetupConfigured(): boolean {
  return !!ADMIN_SETUP_SECRET;
}
