export type OrderPaidPayload = {
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
    itemLabel?: string;
    selectionLines?: string[];
  }[];
};
