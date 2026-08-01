import { describe, expect, test } from "bun:test";
import { ORDER_CONFIRMATION_ERROR_CODE } from "@/lib/commerce/order-confirmation";
import { failureKindForCode } from "@/lib/commerce/order-confirmation-client";

describe("failureKindForCode", () => {
  const definitiveCodes = [
    ORDER_CONFIRMATION_ERROR_CODE.PAYMENT_NOT_SUCCEEDED,
    ORDER_CONFIRMATION_ERROR_CODE.PAYMENT_EXPIRED,
    ORDER_CONFIRMATION_ERROR_CODE.INVALID_PAYMENT_INTENT,
    ORDER_CONFIRMATION_ERROR_CODE.INVALID_REFERENCE,
    ORDER_CONFIRMATION_ERROR_CODE.INVALID_PROVIDER,
    ORDER_CONFIRMATION_ERROR_CODE.INVALID_SESSION,
  ] as const;

  const indeterminateCodes = [
    ORDER_CONFIRMATION_ERROR_CODE.MISSING_ORDER,
    ORDER_CONFIRMATION_ERROR_CODE.ORDER_NOT_CONFIRMED,
  ] as const;

  test("maps definitive failure codes to definitive", () => {
    for (const code of definitiveCodes) {
      expect(failureKindForCode(code)).toBe("definitive");
    }
  });

  test("maps indeterminate codes to indeterminate", () => {
    for (const code of indeterminateCodes) {
      expect(failureKindForCode(code)).toBe("indeterminate");
    }
  });

  test("maps undefined to indeterminate", () => {
    expect(failureKindForCode(undefined)).toBe("indeterminate");
  });
});
