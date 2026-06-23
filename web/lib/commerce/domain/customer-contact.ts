/** Shared pickup contact validation (stored only in our DB; never sent to payment rails). */

export const CUSTOMER_NAME_MAX_LEN = 200;
/** Formatted US domestic phone: (xxx) xxx-xxxx */
export const CUSTOMER_PHONE_MAX_LEN = 14;
export const US_PHONE_DIGIT_COUNT = 10;
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

export function extractPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Strips leading US country code (+1) when present on an 11-digit number. */
export function stripUsCountryCode(digits: string): string {
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

export function toUsLocalPhoneDigits(rawPhone: string): string {
  return stripUsCountryCode(extractPhoneDigits(rawPhone));
}

/** Formats partial or full input as US domestic (xxx) xxx-xxxx; caps at 10 digits. */
export function formatUsPhoneInput(raw: string): string {
  const digits = stripUsCountryCode(extractPhoneDigits(raw)).slice(0, US_PHONE_DIGIT_COUNT);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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
  const digits = stripUsCountryCode(extractPhoneDigits(customerPhone));
  if (digits.length !== US_PHONE_DIGIT_COUNT) {
    return { ok: false, error: "customerPhone must be a 10-digit US phone number" };
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
    value: { customerName, customerPhone: formatUsPhoneInput(digits), customerEmail },
  };
}
