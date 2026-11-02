/** Preserve the cart across site navigation, but never reuse it with a new catalog. */
export function cartForMenuVersion<T>(
  cart: { lines: T[]; menuVersion: number | null },
  menuVersion: number,
): { lines: T[]; menuVersion: number | null } {
  if (cart.menuVersion === menuVersion) return cart;
  return {
    lines: cart.menuVersion === null ? cart.lines : [],
    menuVersion,
  };
}
