export type OrderPaidPayload = {
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
