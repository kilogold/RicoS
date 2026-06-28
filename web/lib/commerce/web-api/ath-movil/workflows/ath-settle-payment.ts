import { athSettlementTickStep } from "@/lib/commerce/web-api/ath-movil/workflows/steps/ath-settlement-tick-step";
import { markAthExpiredStep } from "@/lib/commerce/web-api/ath-movil/workflows/steps/mark-ath-expired-step";

type AthSettlePaymentInput = {
  orderReference: string;
  publicToken: string;
  authToken: string;
  settlementDeadlineAt: number;
};

export async function athSettlePayment(input: AthSettlePaymentInput) {
  "use workflow";

  const result = await athSettlementTickStep({
    orderReference: input.orderReference,
    publicToken: input.publicToken,
    authToken: input.authToken,
    settlementDeadlineAt: input.settlementDeadlineAt,
  });

  if (result !== "continue") {
    return { outcome: result };
  }

  await markAthExpiredStep(input.orderReference, "ath_settlement_timeout");
  return { outcome: "expired" };
}
