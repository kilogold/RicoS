export type IngressProvider = "stripe" | "helius";

export type NormalizedIngressEvent = {
  provider: IngressProvider;
  ingressEventId: string;
  paymentReferenceId: string;
  amountCents: number;
  currency: string;
  metadata: Record<string, string | undefined>;
};

export type KitchenOrderPayload = {
  stripeEventId: string;
  paymentIntentId: string;
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
