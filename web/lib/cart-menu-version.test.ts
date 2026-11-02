import { describe, expect, test } from "bun:test";
import { cartForMenuVersion } from "./cart-menu-version";

describe("cart menu version synchronization", () => {
  test("initializes the catalog marker", () => {
    expect(cartForMenuVersion({ lines: [], menuVersion: null }, 1)).toEqual({ lines: [], menuVersion: 1 });
  });

  test("preserves items and state identity when re-entering the same catalog", () => {
    const cart = { lines: [{ id: "coffee", quantity: 2 }], menuVersion: 3 };
    expect(cartForMenuVersion(cart, 3)).toBe(cart);
  });

  test("clears surviving items when the catalog changes, including rollback", () => {
    for (const version of [2, 4]) {
      expect(cartForMenuVersion({ lines: [{ id: "coffee", quantity: 2 }], menuVersion: 3 }, version))
        .toEqual({ lines: [], menuVersion: version });
    }
  });
});
