import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { __resetStoreHoursCacheForTests } from "@/lib/commerce/domain/store-hours";
import { proxy } from "./proxy";

const names = ["STORE_OPEN_TIME", "STORE_LAST_CALL_TIME", "STORE_CLOSE_TIME", "STORE_HOURS_OVERRIDE"] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
beforeEach(() => {
  __resetStoreHoursCacheForTests();
  process.env.STORE_OPEN_TIME = "08:00";
  process.env.STORE_LAST_CALL_TIME = "20:00";
  process.env.STORE_CLOSE_TIME = "21:00";
});
afterEach(() => {
  __resetStoreHoursCacheForTests();
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
});

describe("storefront routing", () => {
  test("closed checkout GET and HEAD return to ordering", () => {
    process.env.STORE_HOURS_OVERRIDE = "2";
    for (const method of ["GET", "HEAD"]) {
      const response = proxy(new NextRequest("https://ricorest.com/checkout", { method }));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://ricorest.com/order");
    }
  });

  test("open checkout continues", () => {
    process.env.STORE_HOURS_OVERRIDE = "1";
    expect(proxy(new NextRequest("https://ricorest.com/checkout")).headers.get("location")).toBeNull();
  });

  test("closed payment creation stays blocked for all providers", async () => {
    process.env.STORE_HOURS_OVERRIDE = "2";
    for (const path of ["/api/create-payment-intent", "/api/solana-pay/reference", "/api/ath-movil/reference"]) {
      const response = proxy(new NextRequest(`https://ricorest.com${path}`, { method: "POST" }));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "STORE_CLOSED" });
    }
  });

  test("closed landing and ordering pages remain accessible", () => {
    process.env.STORE_HOURS_OVERRIDE = "2";
    for (const path of ["/", "/order"]) {
      expect(proxy(new NextRequest(`https://ricorest.com${path}`)).headers.get("location")).toBeNull();
    }
  });
});
