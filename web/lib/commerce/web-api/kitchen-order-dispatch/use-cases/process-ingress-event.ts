import {
  createMenuCatalogSurface,
  decodeCartFromMetadataV1,
  type HydratedCart,
  type HydratedCartLine,
} from "@ricos/shared";
import type { Client } from "@libsql/client";
import type { KitchenOrderPayload, NormalizedIngressEvent } from "@/lib/commerce/domain";
import type { OrderServiceMode } from "@/lib/commerce/order-service-mode";
import {
  fetchMenuCatalogAndDecodeIndexByVersion,
  getDecodeIndex,
} from "@/lib/infrastructure/turso/webhook-db";

export class IngressProcessError extends Error {
  constructor(
    readonly code:
      | "invalid_cart_metadata"
      | "cart_total_mismatch"
      | "persist_failed"
      | "missing_solana_pending"
      | "missing_solana_signature"
      | "missing_pending_order"
      | "payment_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "IngressProcessError";
  }
}

/**
 * Validate cart metadata against the persisted menu version and produce the
 * ticket-ready `KitchenOrderPayload`. Pure builder — no DB writes, no broadcast.
 */
export async function buildKitchenOrderPayload(
  db: Client,
  event: NormalizedIngressEvent,
  serviceMode: OrderServiceMode,
  customerName: string,
): Promise<KitchenOrderPayload> {
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

  const row = await fetchMenuCatalogAndDecodeIndexByVersion(db, decodedCart.menuVersion);
  if (!row) {
    throw new IngressProcessError(
      "invalid_cart_metadata",
      `Unknown menu version ${decodedCart.menuVersion} for kitchen payload`,
    );
  }
  const surface = createMenuCatalogSurface(row.catalog);

  const lines: KitchenOrderPayload["lines"] = decodedCart.lines.map((line) => {
    const item = surface.getItemById(line.id);
    const itemLabel = item ? surface.resolveLocalizedText(item.name, "en") : line.id;
    const selectionLines = surface.getSelectionDisplayLines(line.id, line.selections, "en");
    return {
      ...line,
      itemLabel,
      selectionLines,
    };
  });

  return {
    paymentIngressEventId: event.paymentIngressEventId,
    paymentReferenceId: event.paymentReferenceId,
    serviceMode,
    customerName: customerName.trim(),
    amountCents: Number(event.amountCents),
    currency: event.currency,
    lines,
    intent: "manual-print",
  };
}
