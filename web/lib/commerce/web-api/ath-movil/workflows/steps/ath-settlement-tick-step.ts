import { FatalError, RetryableError } from "workflow";
import {
  AthPaymentApiError,
} from "@/lib/commerce/web-api/ath-movil/adapters/http/athm-payment-api-client";
import {
  type AthSettlementTickResult,
  runAthSettlementTick,
} from "@/lib/commerce/web-api/ath-movil/use-cases/run-ath-settlement-tick";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

type AthSettlementTickStepInput = {
  orderReference: string;
  publicToken: string;
  authToken: string;
  attempt: number;
};

function isFatalAthError(err: AthPaymentApiError): boolean {
  if (err.params.code !== "api_error") return false;
  if (typeof err.params.status !== "number") return false;
  return err.params.status >= 400 && err.params.status < 500 && err.params.status !== 429;
}

export async function athSettlementTickStep(
  input: AthSettlementTickStepInput,
): Promise<AthSettlementTickResult> {
  "use step";

  try {
    const db = await getWebhookDb();
    return await runAthSettlementTick(db, input);
  } catch (err) {
    if (err instanceof AthPaymentApiError) {
      if (isFatalAthError(err)) {
        throw new FatalError(err.message);
      }
      throw new RetryableError(err.message);
    }
    throw err;
  }
}
