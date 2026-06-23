import { sleep } from "workflow";
import { ATH_SETTLEMENT_POLL_INTERVAL } from "@/lib/commerce/web-api/ath-movil/domain/ath-orchestration-constants";
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

  let attempt = 0;
  while (Date.now() < input.settlementDeadlineAt) {
    attempt += 1;
    const result = await athSettlementTickStep({
      orderReference: input.orderReference,
      publicToken: input.publicToken,
      authToken: input.authToken,
      attempt,
    });

    if (result !== "continue") {
      return { outcome: result };
    }

    await sleep(ATH_SETTLEMENT_POLL_INTERVAL);
  }

  await markAthExpiredStep(input.orderReference, "ath_settlement_timeout");
  return { outcome: "expired" };
}
