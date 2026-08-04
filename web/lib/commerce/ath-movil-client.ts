import type { getAppStrings } from "@/lib/i18n";
import {
  ATH_PAYMENT_ERROR_CODE,
  type AthPaymentErrorCode,
} from "@/lib/commerce/web-api/ath-movil/domain/ath-payment-error-codes";

export function athReferenceErrorMessageForCode(
  code: AthPaymentErrorCode | undefined,
  copy: ReturnType<typeof getAppStrings>,
): string {
  switch (code) {
    case ATH_PAYMENT_ERROR_CODE.CUSTOMER_OWN_PHONE:
      return copy.athMovilCustomerOwnPhoneError;
    case ATH_PAYMENT_ERROR_CODE.ATH_API_ERROR:
    default:
      return copy.checkoutErrorTitle;
  }
}
