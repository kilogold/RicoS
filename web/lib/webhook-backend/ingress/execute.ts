import type { Client } from "@libsql/client";
import { processIngressEvent, IngressProcessError } from "./process";
import type { NormalizedIngressEvent } from "./types";
import { publishOrderPaid } from "../runtime";

export async function executeIngressEvent(
  db: Client,
  event: NormalizedIngressEvent,
): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, string> }> {
  try {
    await processIngressEvent(db, event, publishOrderPaid);
    return { ok: true };
  } catch (err) {
    if (err instanceof IngressProcessError) {
      if (err.code === "persist_failed") {
        console.error("kitchen_orders insert failed:", err.message);
        return { ok: false, status: 500, body: { error: err.code } };
      }
      console.error(`Ingress ${event.provider} rejected:`, err.message);
      return { ok: false, status: 400, body: { error: err.code } };
    }

    console.error("Unexpected ingress processing error:", err);
    return { ok: false, status: 500, body: { error: "persist_failed" } };
  }
}
