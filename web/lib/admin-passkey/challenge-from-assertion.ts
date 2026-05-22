/** Extract WebAuthn challenge from base64url-encoded `clientDataJSON`. */
export function challengeFromClientDataJSON(clientDataJSON: string): string | null {
  try {
    const json = JSON.parse(
      Buffer.from(clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: unknown };
    return typeof json.challenge === "string" ? json.challenge : null;
  } catch {
    return null;
  }
}
