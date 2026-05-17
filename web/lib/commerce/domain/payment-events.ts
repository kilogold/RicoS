import type { KitchenOrderIntent, OrderTotals } from "@ricos/shared";
import type { OrderServiceMode } from "@/lib/commerce/order-service-mode";

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

export type KitchenOrderLine = {
  id: string;
  quantity: number;
  selections: Record<string, string[]>;
  unitBasePriceCents: number;
  selectedModifiers: { groupId: string; optionId: string; optionSurchargeCents: number }[];
  lineUnitTotalCents: number;
  lineExtendedTotalCents: number;
  /** English primary label for tickets / relay (server-filled on new ingress). */
  itemLabel?: string;
  /** English modifier summary lines for tickets. */
  selectionLines?: string[];
};

export type KitchenOrderPayload = OrderTotals & {
  paymentIngressEventId: string;
  paymentReferenceId: string;
  serviceMode: OrderServiceMode;
  /** Customer display name for kitchen tickets. */
  customerName: string;
  currency: string;
  lines: KitchenOrderLine[];
  /** `manual-print` while order is pending; `paid` once payment ingress has committed. */
  intent: KitchenOrderIntent;
};
