import type { KitchenOrderIntent, OrderTotals, PurchaseOrderLine } from "@ricos/shared";
import type { OrderServiceMode } from "@/lib/commerce/web-api/staff-order-management/lib/order-service-mode";

export type { KitchenOrderIntent, OrderTotals } from "@ricos/shared";
export {
  PENDING_PAYMENT_NO_SALE_INGRESS_ID,
  isValidPaymentIngressEventId,
} from "@ricos/shared";

export type IngressProvider = "stripe" | "helius";

export type NormalizedIngressEvent = {
  provider: IngressProvider;
  /** Atomic ingress event id (e.g. Stripe event id, or `evt_helius_<transactionSignature>`). */
  paymentIngressEventId: string;
  /**
   * Stable payment reference: Stripe PaymentIntent id, or Solana Pay order reference pubkey
   * (indexes the on-chain order; each landed tx is a separate `paymentIngressEventId`).
   */
  paymentReferenceId: string;
  /** Grand total charged (subtotal + fees + taxes). */
  grandTotalCents: number;
  currency: string;
  metadata: Record<string, string | undefined>;
};

export type { PurchaseOrderLine } from "@ricos/shared";

export type KitchenOrderPayload = OrderTotals & {
  paymentIngressEventId: string;
  paymentReferenceId: string;
  serviceMode: OrderServiceMode;
  /** Customer display name for kitchen tickets. */
  customerName: string;
  currency: string;
  lines: PurchaseOrderLine[];
  /** `manual-print` while order is pending; `paid` once payment ingress has committed. */
  intent: KitchenOrderIntent;
};
