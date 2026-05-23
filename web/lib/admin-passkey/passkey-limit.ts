export type PasskeyLimitStatus = "ok" | "at_limit" | "over_limit";

export function passkeyLimitStatus(count: number, max: number): PasskeyLimitStatus {
  if (count > max) return "over_limit";
  if (count === max) return "at_limit";
  return "ok";
}

export function passkeyLimitHttpStatus(status: PasskeyLimitStatus): number {
  if (status === "over_limit") return 500;
  if (status === "at_limit") return 403;
  return 200;
}

export function passkeyLimitErrorCode(status: PasskeyLimitStatus): string | null {
  if (status === "over_limit") return "passkey_limit_exceeded";
  if (status === "at_limit") return "passkey_limit_reached";
  return null;
}
