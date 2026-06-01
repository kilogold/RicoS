import {
  computeOrderTotalsFromHydratedCart,
  decodeCartFromMetadataV1,
  type HydratedCart,
} from "@ricos/shared";
import type { KitchenOrderPayload, NormalizedIngressEvent } from "@/lib/commerce/domain";
import { getLatestMenuRuntime } from "@/lib/commerce/web-api/staff-order-management/lib/menu-runtime";
import type { OrderServiceMode } from "@/lib/commerce/web-api/staff-order-management/lib/order-service-mode";

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
 * Validate cart metadata against the bundled menu version and produce the
 * ticket-ready `KitchenOrderPayload`. Pure builder — no DB writes, no broadcast.
 */
export async function buildKitchenOrderPayload(
  event: NormalizedIngressEvent,
  serviceMode: OrderServiceMode,
  customerName: string,
): Promise<KitchenOrderPayload> {
  const runtime = await getLatestMenuRuntime();
  const lookupDecodeIndex = (version: number) =>
    version === runtime.version ? runtime.decodeIndex : undefined;

  let decodedCart: HydratedCart;
  try {
    decodedCart = decodeCartFromMetadataV1(event.metadata, lookupDecodeIndex);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new IngressProcessError("invalid_cart_metadata", message);
  }

  if (decodedCart.menuVersion !== runtime.version) {
    throw new IngressProcessError(
      "invalid_cart_metadata",
      `Cart menu version ${decodedCart.menuVersion} does not match active version ${runtime.version}`,
    );
  }

  const orderTotals = computeOrderTotalsFromHydratedCart(
    decodedCart.lines,
    runtime.decodeIndex,
  );
  if (orderTotals.grandTotalCents !== Number(event.grandTotalCents)) {
    throw new IngressProcessError(
      "cart_total_mismatch",
      `Order total mismatch: ${orderTotals.grandTotalCents} !== ${Number(event.grandTotalCents)}`,
    );
  }

  const lines: KitchenOrderPayload["lines"] = decodedCart.lines.map((line) => {
    const item = runtime.surface.getItemById(line.id);
    if (!item) {
      throw new IngressProcessError("invalid_cart_metadata", `Unknown menu item ${line.id}`);
    }
    return {
      ...line,
      station: item.station,
      itemLabel: runtime.surface.resolveLocalizedText(item.name, "en"),
      selectionLines: runtime.surface.getSelectionDisplayLines(line.id, line.selections, "en"),
    };
  });

  return {
    ...orderTotals,
    paymentIngressEventId: event.paymentIngressEventId,
    paymentReferenceId: event.paymentReferenceId,
    serviceMode,
    customerName: customerName.trim(),
    currency: event.currency,
    lines,
    intent: "manual-print",
  };
}
