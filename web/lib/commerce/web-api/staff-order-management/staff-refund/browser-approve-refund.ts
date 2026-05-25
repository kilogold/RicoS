"use client";

import { startAuthentication, type AuthenticationResponseJSON } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import {
  STAFF_REFUND_ERROR_MESSAGES,
  staffRefundBusinessMessage,
} from "@/lib/commerce/web-api/staff-order-management/staff-refund/error-messages";
import type { RefundPayloadForHash } from "@/lib/commerce/web-api/staff-order-management/staff-refund/payload-hash";

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

async function readRefundApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; detail?: string };
    if (typeof body.error === "string") {
      return body.detail ? `${body.error}: ${body.detail}` : body.error;
    }
  } catch {
    /* ignore */
  }
  if (response.status === 503) {
    return "No admin passkey registered. Register a passkey in the admin panel first.";
  }
  if (response.status === 401 || response.status === 403) {
    return "Passkey approval was denied.";
  }
  return `Request failed (HTTP ${response.status}).`;
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
    return { ok: false, message: await readRefundApiError(startResponse) };
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
    if (code && STAFF_REFUND_ERROR_MESSAGES[code]) {
      const detail =
        typeof verifyBody.detail === "string" ? ` ${verifyBody.detail}` : "";
      return { ok: false, message: `${staffRefundBusinessMessage(code)}${detail}` };
    }
    return {
      ok: false,
      message: code
        ? staffRefundBusinessMessage(code)
        : await readRefundApiError(verifyResponse),
    };
  }

  return { ok: true, body: verifyBody };
}
