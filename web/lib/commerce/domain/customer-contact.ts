/** Shared pickup contact validation (stored only in our DB; never sent to payment rails). */

export const CUSTOMER_NAME_MAX_LEN = 200;
export const CUSTOMER_PHONE_MAX_LEN = 40;
export const CUSTOMER_EMAIL_MAX_LEN = 320;

const EMAIL_LOOSE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CustomerContactInput = {
  customerName: unknown;
  customerPhone: unknown;
  customerEmail?: unknown;
};

export type NormalizedCustomerContact = {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
};

export type ValidateCustomerContactResult =
  | { ok: true; value: NormalizedCustomerContact }
  | { ok: false; error: string };

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Validates required name + phone and optional email for order placement APIs.
 */
export function validateCustomerContact(input: CustomerContactInput): ValidateCustomerContactResult {
  const customerName = trimStr(input.customerName);
  const customerPhone = trimStr(input.customerPhone);
  const emailRaw = trimStr(input.customerEmail);

  if (!customerName) {
    return { ok: false, error: "customerName is required" };
  }
  if (customerName.length > CUSTOMER_NAME_MAX_LEN) {
    return { ok: false, error: `customerName must be at most ${CUSTOMER_NAME_MAX_LEN} characters` };
  }

  if (!customerPhone) {
    return { ok: false, error: "customerPhone is required" };
  }
  if (customerPhone.length > CUSTOMER_PHONE_MAX_LEN) {
    return { ok: false, error: `customerPhone must be at most ${CUSTOMER_PHONE_MAX_LEN} characters` };
  }
  const digits = customerPhone.replace(/\D/g, "");
  if (digits.length < 7) {
    return { ok: false, error: "customerPhone must include at least 7 digits" };
  }

  let customerEmail: string | null = null;
  if (emailRaw) {
    if (emailRaw.length > CUSTOMER_EMAIL_MAX_LEN) {
      return { ok: false, error: `customerEmail must be at most ${CUSTOMER_EMAIL_MAX_LEN} characters` };
    }
    if (!EMAIL_LOOSE.test(emailRaw)) {
      return { ok: false, error: "customerEmail format is invalid" };
    }
    customerEmail = emailRaw;
  }

  return {
    ok: true,
    value: { customerName, customerPhone, customerEmail },
  };
}
