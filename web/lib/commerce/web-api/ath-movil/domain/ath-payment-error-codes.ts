export const ATH_PAYMENT_ERROR_CODE = {
  CUSTOMER_OWN_PHONE: "ath_customer_own_phone",
  ATH_API_ERROR: "ath_api_error",
} as const;

export type AthPaymentErrorCode =
  (typeof ATH_PAYMENT_ERROR_CODE)[keyof typeof ATH_PAYMENT_ERROR_CODE];

const USER_FIXABLE_ATH_API_CODES = new Set(["PCUS_0007"]);

export function mapAthApiErrorCode(
  athErrorCode: string | undefined,
): AthPaymentErrorCode {
  if (athErrorCode === "PCUS_0007") {
    return ATH_PAYMENT_ERROR_CODE.CUSTOMER_OWN_PHONE;
  }
  return ATH_PAYMENT_ERROR_CODE.ATH_API_ERROR;
}

export function isUserFixableAthApiError(athErrorCode: string | undefined): boolean {
  return typeof athErrorCode === "string" && USER_FIXABLE_ATH_API_CODES.has(athErrorCode);
}
