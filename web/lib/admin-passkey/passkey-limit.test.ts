import { describe, expect, test } from "bun:test";
import {
  passkeyLimitErrorCode,
  passkeyLimitHttpStatus,
  passkeyLimitStatus,
} from "./passkey-limit";

describe("passkeyLimitStatus", () => {
  test("ok when under max", () => {
    expect(passkeyLimitStatus(2, 5)).toBe("ok");
  });

  test("at_limit when count equals max", () => {
    expect(passkeyLimitStatus(5, 5)).toBe("at_limit");
    expect(passkeyLimitHttpStatus("at_limit")).toBe(403);
    expect(passkeyLimitErrorCode("at_limit")).toBe("passkey_limit_reached");
  });

  test("over_limit when count exceeds max", () => {
    expect(passkeyLimitStatus(6, 5)).toBe("over_limit");
    expect(passkeyLimitHttpStatus("over_limit")).toBe(500);
    expect(passkeyLimitErrorCode("over_limit")).toBe("passkey_limit_exceeded");
  });
});
