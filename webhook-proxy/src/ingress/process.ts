import { decodeCartFromMetadataV1, type HydratedCart, type HydratedCartLine } from "@ricos/shared";
import type { Client } from "@libsql/client";
import { getDecodeIndex, insertPendingIfNew, type KitchenOrderPayload } from "../db.js";
import type { NormalizedIngressEvent } from "./types.js";

export class IngressProcessError extends Error {
  constructor(
    readonly code: "invalid_cart_metadata" | "cart_total_mismatch" | "persist_failed",
    message: string,
  ) {
    super(message);
    this.name = "IngressProcessError";
  }
}

export async function processIngressEvent(
  db: Client,
  event: NormalizedIngressEvent,
  broadcastOrderPaid: (payload: KitchenOrderPayload) => void,
): Promise<void> {
  let decodedCart: HydratedCart;
  try {
    decodedCart = decodeCartFromMetadataV1(event.metadata, getDecodeIndex);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new IngressProcessError("invalid_cart_metadata", message);
  }

  const recomputedCartTotalCents = decodedCart.lines.reduce(
    (sum: number, line: HydratedCartLine) => sum + line.lineExtendedTotalCents,
    0,
  );
  if (recomputedCartTotalCents !== Number(event.amountCents)) {
    throw new IngressProcessError(
      "cart_total_mismatch",
      `Cart total mismatch: ${recomputedCartTotalCents} !== ${Number(event.amountCents)}`,
    );
  }

  const payload: KitchenOrderPayload = {
    stripeEventId: event.ingressEventId,
    paymentIntentId: event.paymentReferenceId,
    amountCents: Number(event.amountCents),
    currency: event.currency,
    lines: decodedCart.lines,
  };

  try {
    const inserted = await insertPendingIfNew(db, payload);
    if (inserted) {
      try {
        broadcastOrderPaid(payload);
      } catch (broadcastErr) {
        console.error("SSE broadcast failed (order is persisted):", broadcastErr);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new IngressProcessError("persist_failed", message);
  }
}
