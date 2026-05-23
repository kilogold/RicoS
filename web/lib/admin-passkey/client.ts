"use client";

import {
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import type { RefundPayloadForHash } from "@/lib/admin-passkey/payload-hash";

export type ApproveRefundResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; message: string };

function isUserCancelledWebAuthnError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name;
  return (
    name === "NotAllowedError" ||
    name === "AbortError" ||
    /cancel/i.test(err.message) ||
    /not allowed/i.test(err.message)
  );
}

async function readApiError(response: Response): Promise<string> {
  // Prefer structured { error, detail } from the API; fall through on non-JSON bodies.
  try {
    const body = (await response.json()) as { error?: string; detail?: string };
    if (typeof body.error === "string") {
      return body.detail ? `${body.error}: ${body.detail}` : body.error;
    }
  } catch {
    /* ignore */
    // Empty/HTML/plain-text error bodies are common; use status-based messages below.
  }
  if (response.status === 503) {
    return "No admin passkey registered. Register a passkey in the admin panel first.";
  }
  if (response.status === 401 || response.status === 403) {
    return "Passkey approval was denied.";
  }
  return `Request failed (HTTP ${response.status}).`;
}

const REFUND_ERROR_MESSAGES: Record<string, string> = {
  order_not_found: "Order not found.",
  already_refunded: "This order was already refunded.",
  cannot_refund_order_status: "This order cannot be refunded in its current status.",
  refund_exceeds_order_total: "Refund amount exceeds the order total.",
  missing_solana_signature: "Solana refund transaction signature is required.",
  server_misconfigured: "Refund could not be processed (server misconfigured).",
  stripe_refund_failed: "Stripe refund failed. Try again or check Stripe.",
};

function refundBusinessMessage(errorCode: string): string {
  return REFUND_ERROR_MESSAGES[errorCode] ?? errorCode;
}

export type SignInWithAdminPasskeyResult =
  | { ok: true }
  | { ok: false; message: string };

export async function signInWithAdminPasskey(): Promise<SignInWithAdminPasskeyResult> {
  let startResponse: Response;
  try {
    startResponse = await fetch("/api/staff/admin/session/start", {
      method: "POST",
      credentials: "include",
    });
  } catch (networkErr) {
    return {
      ok: false,
      message:
        networkErr instanceof Error
          ? networkErr.message
          : "Could not reach the sign-in server.",
    };
  }

  if (!startResponse.ok) {
    return { ok: false, message: await readApiError(startResponse) };
  }

  let optionsJSON: PublicKeyCredentialRequestOptionsJSON;
  try {
    const startBody = (await startResponse.json()) as {
      options?: PublicKeyCredentialRequestOptionsJSON;
    };
    if (!startBody.options) {
      return { ok: false, message: "Sign-in failed: invalid server response." };
    }
    optionsJSON = startBody.options;
  } catch {
    return { ok: false, message: "Sign-in failed: invalid server response." };
  }

  let authenticationResponse: AuthenticationResponseJSON;
  try {
    authenticationResponse = await startAuthentication({ optionsJSON });
  } catch (webAuthnErr) {
    if (isUserCancelledWebAuthnError(webAuthnErr)) {
      return { ok: false, message: "Sign-in was cancelled." };
    }
    const detail =
      webAuthnErr instanceof Error && webAuthnErr.message
        ? ` ${webAuthnErr.message}`
        : "";
    return {
      ok: false,
      message: `Sign-in failed. Check device settings and try again.${detail}`,
    };
  }

  let verifyResponse: Response;
  try {
    verifyResponse = await fetch("/api/staff/admin/session/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authenticationResponse }),
    });
  } catch (networkErr) {
    return {
      ok: false,
      message:
        networkErr instanceof Error
          ? networkErr.message
          : "Could not complete sign-in verification.",
    };
  }

  if (!verifyResponse.ok) {
    return { ok: false, message: await readApiError(verifyResponse) };
  }

  return { ok: true };
}

export async function approveRefund(
  payload: RefundPayloadForHash,
): Promise<ApproveRefundResult> {
  let startResponse: Response;
  try {
    startResponse = await fetch("/api/staff/admin/refund/start", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    return {
      ok: false,
      message:
        networkErr instanceof Error
          ? networkErr.message
          : "Could not reach the refund server.",
    };
  }

  if (!startResponse.ok) {
    return { ok: false, message: await readApiError(startResponse) };
  }

  let optionsJSON: PublicKeyCredentialRequestOptionsJSON;
  try {
    const startBody = (await startResponse.json()) as {
      options?: PublicKeyCredentialRequestOptionsJSON;
    };
    if (!startBody.options) {
      return { ok: false, message: "Passkey approval failed: invalid server response." };
    }
    optionsJSON = startBody.options;
  } catch {
    return { ok: false, message: "Passkey approval failed: invalid server response." };
  }

  let authenticationResponse: AuthenticationResponseJSON;
  try {
    authenticationResponse = await startAuthentication({ optionsJSON });
  } catch (webAuthnErr) {
    if (isUserCancelledWebAuthnError(webAuthnErr)) {
      return {
        ok: false,
        message: "Passkey approval was cancelled. Refund was not submitted.",
      };
    }
    const detail =
      webAuthnErr instanceof Error && webAuthnErr.message
        ? ` ${webAuthnErr.message}`
        : "";
    return {
      ok: false,
      message: `Passkey approval failed. Check device settings and try again.${detail}`,
    };
  }

  let verifyResponse: Response;
  try {
    verifyResponse = await fetch("/api/staff/admin/refund/verify-and-run", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, authenticationResponse }),
    });
  } catch (networkErr) {
    return {
      ok: false,
      message:
        networkErr instanceof Error
          ? networkErr.message
          : "Could not complete refund verification.",
    };
  }

  let verifyBody: Record<string, unknown>;
  try {
    verifyBody = (await verifyResponse.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      message: verifyResponse.ok
        ? "Refund response could not be read."
        : "Passkey verification failed. Try again.",
    };
  }

  if (!verifyResponse.ok) {
    const code = typeof verifyBody.error === "string" ? verifyBody.error : "";
    if (
      code === "challenge_not_found" ||
      code === "challenge_expired" ||
      code === "payload_hash_mismatch" ||
      code === "verification_failed" ||
      code === "invalid_challenge"
    ) {
      const serverMsg =
        typeof verifyBody.error === "string" ? verifyBody.error : "verification failed";
      return {
        ok: false,
        message: `Passkey verification failed. Try again. (${serverMsg})`,
      };
    }
    if (code && REFUND_ERROR_MESSAGES[code]) {
      const detail =
        typeof verifyBody.detail === "string" ? ` ${verifyBody.detail}` : "";
      return { ok: false, message: `${refundBusinessMessage(code)}${detail}` };
    }
    return {
      ok: false,
      message: code ? refundBusinessMessage(code) : await readApiError(verifyResponse),
    };
  }

  return { ok: true, body: verifyBody };
}

export type RegisterPasskeyResult =
  | { ok: true }
  | { ok: false; message: string };

export async function registerAdminPasskey(params: {
  setupSecret?: string;
  name?: string;
  approval?: AuthenticationResponseJSON;
}): Promise<RegisterPasskeyResult> {
  const optionsRes = await fetch("/api/staff/admin/passkey/register/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setupSecret: params.setupSecret,
      name: params.name,
      approval: params.approval,
    }),
  });

  const optionsRaw = await optionsRes.json().catch(() => ({}));
  console.log("[passkey register/options]", optionsRes.status, optionsRaw);

  if (!optionsRes.ok) {
    const message =
      typeof (optionsRaw as { error?: string }).error === "string"
        ? (optionsRaw as { error: string; detail?: string }).detail
          ? `${(optionsRaw as { error: string }).error}: ${(optionsRaw as { detail: string }).detail}`
          : (optionsRaw as { error: string }).error
        : `Request failed (HTTP ${optionsRes.status}).`;
    return { ok: false, message };
  }

  const optionsBody = optionsRaw as {
    step?: string;
    options?: PublicKeyCredentialRequestOptionsJSON | PublicKeyCredentialCreationOptionsJSON;
  };

  if (optionsBody.step === "authenticate" && optionsBody.options) {
    let approval: AuthenticationResponseJSON;
    try {
      approval = await startAuthentication({
        optionsJSON: optionsBody.options as PublicKeyCredentialRequestOptionsJSON,
      });
    } catch (err) {
      if (isUserCancelledWebAuthnError(err)) {
        return { ok: false, message: "Passkey approval was cancelled." };
      }
      return { ok: false, message: "Passkey approval failed. Try again." };
    }
    return registerAdminPasskey({ ...params, approval });
  }

  if (optionsBody.step !== "register" || !optionsBody.options) {
    return { ok: false, message: "Invalid registration options from server." };
  }

  let registrationResponse: RegistrationResponseJSON;
  try {
    registrationResponse = await startRegistration({
      optionsJSON: optionsBody.options as PublicKeyCredentialCreationOptionsJSON,
    });
  } catch (err) {
    if (isUserCancelledWebAuthnError(err)) {
      return { ok: false, message: "Passkey registration was cancelled." };
    }
    return { ok: false, message: "Passkey registration failed. Try again." };
  }

  const verifyRes = await fetch("/api/staff/admin/passkey/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      registrationResponse,
    }),
  });

  const verifyRaw = await verifyRes.json().catch(() => ({}));
  console.log("[passkey register/verify]", verifyRes.status, verifyRaw);

  if (!verifyRes.ok) {
    const message =
      typeof (verifyRaw as { error?: string }).error === "string"
        ? (verifyRaw as { error: string; detail?: string }).detail
          ? `${(verifyRaw as { error: string }).error}: ${(verifyRaw as { detail: string }).detail}`
          : (verifyRaw as { error: string }).error
        : `Request failed (HTTP ${verifyRes.status}).`;
    return { ok: false, message };
  }

  return { ok: true };
}
