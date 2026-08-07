/**
 * Structured, single-line security logging for the admin passkey flow.
 *
 * Deliberately minimal: one JSON line per event, no PII beyond a truncated
 * credential id (never the full id, never public keys, challenges, or
 * secrets). "high" severity is reserved for outcomes that cannot occur during
 * normal use — a mismatched challenge type, or a gate approval from a passkey
 * other than the enrolling one — so any occurrence in production logs is
 * either an attack in progress or a regression, not routine noise.
 */

export type SecuritySeverity = "info" | "warn" | "high";
export type SecurityOutcome = "ok" | "denied" | "error";

type SecurityLogParams = {
  event: string;
  outcome: SecurityOutcome;
  reason?: string;
  credentialId?: string | null;
  severity?: SecuritySeverity;
};

function truncateCredentialId(credentialId: string | null | undefined): string | null {
  if (!credentialId) return null;
  if (credentialId.length <= 10) return credentialId;
  return `${credentialId.slice(0, 8)}…(${credentialId.length})`;
}

function defaultSeverity(outcome: SecurityOutcome): SecuritySeverity {
  return outcome === "ok" ? "info" : "warn";
}

export function logSecurityEvent(params: SecurityLogParams): void {
  const severity = params.severity ?? defaultSeverity(params.outcome);
  const line = JSON.stringify({
    at: new Date().toISOString(),
    scope: "admin_passkey",
    event: params.event,
    outcome: params.outcome,
    severity,
    reason: params.reason ?? null,
    credentialId: truncateCredentialId(params.credentialId),
  });

  if (severity === "high") {
    console.error(line);
  } else if (params.outcome === "ok") {
    console.log(line);
  } else {
    console.warn(line);
  }
}
