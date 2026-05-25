export const ORDER_SERVICE_MODE_TAKEOUT = "takeout" as const;
export const ORDER_SERVICE_MODE_DINE_IN = "dine_in" as const;

export type OrderServiceMode =
  | typeof ORDER_SERVICE_MODE_TAKEOUT
  | typeof ORDER_SERVICE_MODE_DINE_IN;

export type ValidateOrderServiceModeResult =
  | { ok: true; value: OrderServiceMode }
  | { ok: false; error: string };

export function validateOrderServiceMode(input: unknown): ValidateOrderServiceModeResult {
  if (input === ORDER_SERVICE_MODE_TAKEOUT || input === ORDER_SERVICE_MODE_DINE_IN) {
    return { ok: true, value: input };
  }
  return { ok: false, error: "serviceMode must be takeout or dine_in" };
}

export function orderServiceModeLabel(mode: OrderServiceMode): string {
  return mode === ORDER_SERVICE_MODE_DINE_IN ? "Dine-in" : "Takeout";
}
