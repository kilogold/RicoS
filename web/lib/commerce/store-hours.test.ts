import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __resetStoreHoursCacheForTests,
  dineInOrderingEnabled,
  getStoreSession,
  shoppingEnabled,
} from "./store-hours";

function defaultSchedule() {
  process.env.STORE_OPEN_TIME = "08:00";
  process.env.STORE_LAST_CALL_TIME = "20:00";
  process.env.STORE_CLOSE_TIME = "21:00";
}

describe("getStoreSession", () => {
  beforeEach(() => {
    __resetStoreHoursCacheForTests();
    defaultSchedule();
    delete process.env.STORE_HOURS_OVERRIDE;
  });

  afterEach(() => {
    __resetStoreHoursCacheForTests();
    delete process.env.STORE_OPEN_TIME;
    delete process.env.STORE_LAST_CALL_TIME;
    delete process.env.STORE_CLOSE_TIME;
    delete process.env.STORE_HOURS_OVERRIDE;
  });

  test("07:59 local is closed (before open)", () => {
    const now = new Date("2024-01-15T11:59:00.000Z");
    const s = getStoreSession(now);
    expect(s.status).toBe("closed");
    expect(shoppingEnabled(s)).toBe(false);
    expect(dineInOrderingEnabled(s)).toBe(false);
  });

  test("08:00 local is open", () => {
    const now = new Date("2024-01-15T12:00:00.000Z");
    const s = getStoreSession(now);
    expect(s.status).toBe("open");
    expect(shoppingEnabled(s)).toBe(true);
    expect(dineInOrderingEnabled(s)).toBe(true);
  });

  test("19:59:59 local is still open", () => {
    const now = new Date("2024-01-15T23:59:59.000Z");
    const s = getStoreSession(now);
    expect(s.status).toBe("open");
  });

  test("20:00:00 local is last_call not open", () => {
    const now = new Date("2024-01-16T00:00:00.000Z");
    const s = getStoreSession(now);
    expect(s.status).toBe("last_call");
    expect(shoppingEnabled(s)).toBe(true);
    expect(dineInOrderingEnabled(s)).toBe(false);
  });

  test("20:30 local is last_call", () => {
    const now = new Date("2024-01-16T00:30:00.000Z");
    const s = getStoreSession(now);
    expect(s.status).toBe("last_call");
  });

  test("21:00:00 local is closed", () => {
    const now = new Date("2024-01-16T01:00:00.000Z");
    const s = getStoreSession(now);
    expect(s.status).toBe("closed");
    expect(shoppingEnabled(s)).toBe(false);
    expect(dineInOrderingEnabled(s)).toBe(false);
  });

  test("STORE_HOURS_OVERRIDE=1 forces open when naturally closed", () => {
    process.env.STORE_HOURS_OVERRIDE = "1";
    const now = new Date("2024-01-16T02:00:00.000Z");
    const s = getStoreSession(now);
    expect(s.status).toBe("open");
    expect(shoppingEnabled(s)).toBe(true);
  });

  test("STORE_HOURS_OVERRIDE=2 forces closed when naturally open", () => {
    process.env.STORE_HOURS_OVERRIDE = "2";
    const now = new Date("2024-01-15T12:00:00.000Z");
    const s = getStoreSession(now);
    expect(s.status).toBe("closed");
    expect(shoppingEnabled(s)).toBe(false);
  });

  test("closesAt uses STORE_CLOSE_TIME on the store calendar (AST)", () => {
    const anchor = new Date("2024-01-15T14:00:00.000Z");
    const s = getStoreSession(anchor);
    expect(s.closesAt.toISOString()).toBe("2024-01-16T01:00:00.000Z");
  });

  test("minute-precision open and close", () => {
    __resetStoreHoursCacheForTests();
    process.env.STORE_OPEN_TIME = "08:30";
    process.env.STORE_LAST_CALL_TIME = "20:15";
    process.env.STORE_CLOSE_TIME = "21:45";
    // 08:29 AST → closed
    const beforeOpen = new Date("2024-01-15T12:29:00.000Z");
    expect(getStoreSession(beforeOpen).status).toBe("closed");
    // 08:30 AST → open
    const atOpen = new Date("2024-01-15T12:30:00.000Z");
    expect(getStoreSession(atOpen).status).toBe("open");
    // 21:45 AST → closed (half-open end)
    const atClose = new Date("2024-01-16T01:45:00.000Z");
    expect(getStoreSession(atClose).status).toBe("closed");
    const anchor = new Date("2024-01-15T14:00:00.000Z");
    expect(getStoreSession(anchor).closesAt.toISOString()).toBe("2024-01-16T01:45:00.000Z");
  });

  test("explicit last call window (not tied to close hour only)", () => {
    __resetStoreHoursCacheForTests();
    process.env.STORE_OPEN_TIME = "09:00";
    process.env.STORE_LAST_CALL_TIME = "17:00";
    process.env.STORE_CLOSE_TIME = "18:00";
    // 2024-06-01 16:30 AST → open
    const open = new Date("2024-06-01T20:30:00.000Z");
    expect(getStoreSession(open).status).toBe("open");
    // 17:30 AST → last_call
    const lastCall = new Date("2024-06-01T21:30:00.000Z");
    expect(getStoreSession(lastCall).status).toBe("last_call");
    // 18:30 AST → closed
    const closed = new Date("2024-06-01T22:30:00.000Z");
    expect(getStoreSession(closed).status).toBe("closed");
  });
});
