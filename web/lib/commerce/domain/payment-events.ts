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
  amountCents: number;
  currency: string;
  metadata: Record<string, string | undefined>;
};

export type KitchenOrderPayload = {
  paymentIngressEventId: string;
  paymentReferenceId: string;
  amountCents: number;
  currency: string;
  lines: {
    id: string;
    quantity: number;
    selections: Record<string, string[]>;
    unitBasePriceCents: number;
    selectedModifiers: { groupId: string; optionId: string; optionSurchargeCents: number }[];
    lineUnitTotalCents: number;
    lineExtendedTotalCents: number;
  }[];
};
