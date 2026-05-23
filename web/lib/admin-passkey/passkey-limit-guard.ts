import { maxAllowedPasskeys } from "@/lib/admin-passkey/config";
import { jsonError } from "@/lib/admin-passkey/http";
import {
  passkeyLimitErrorCode,
  passkeyLimitHttpStatus,
  passkeyLimitStatus,
} from "@/lib/admin-passkey/passkey-limit";

export function passkeyLimitResponse(passkeyCount: number): Response | null {
  const status = passkeyLimitStatus(passkeyCount, maxAllowedPasskeys());
  if (status === "ok") return null;
  const code = passkeyLimitErrorCode(status);
  if (!code) return null;
  return jsonError(code, passkeyLimitHttpStatus(status));
}
