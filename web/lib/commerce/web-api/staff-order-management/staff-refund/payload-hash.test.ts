import { describe, expect, test } from "bun:test";
import { canonicalRefundPayload, hashRefundPayload } from "./payload-hash";

describe("hashRefundPayload", () => {
  test("stable hash for same logical payload", () => {
    const a = hashRefundPayload({
      orderReference: "  ord-1  ",
      amountCents: 500,
      idempotencyKey: " key-1 ",
    });
    const b = hashRefundPayload({
      orderReference: "ord-1",
      amountCents: 500,
      idempotencyKey: "key-1",
    });
    expect(a).toBe(b);
  });

  test("different amount changes hash", () => {
    const base = {
      orderReference: "ord-1",
      amountCents: 500,
    };
    expect(hashRefundPayload({ ...base, amountCents: 501 })).not.toBe(
      hashRefundPayload(base),
    );
  });

  test("canonical omits empty optional strings", () => {
    expect(
      canonicalRefundPayload({
        orderReference: "x",
        amountCents: 1,
        idempotencyKey: "   ",
      }),
    ).toEqual({ amountCents: 1, orderReference: "x" });
  });
});
