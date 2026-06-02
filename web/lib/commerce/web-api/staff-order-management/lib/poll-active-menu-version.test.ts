import { describe, expect, test } from "bun:test";
import { pollUntilActiveMenuVersion } from "./poll-active-menu-version";

describe("pollUntilActiveMenuVersion", () => {
  test("resolves when active version matches", async () => {
    let calls = 0;
    await pollUntilActiveMenuVersion(5, {
      maxAttempts: 3,
      intervalMs: 1,
      sleep: async () => {},
      fetchActiveVersion: async () => {
        calls += 1;
        return calls >= 2 ? 5 : 4;
      },
    });
    expect(calls).toBe(2);
  });

  test("throws after max attempts", async () => {
    await expect(
      pollUntilActiveMenuVersion(9, {
        maxAttempts: 2,
        intervalMs: 1,
        sleep: async () => {},
        fetchActiveVersion: async () => 8,
      }),
    ).rejects.toThrow("Live menu did not reach v9");
  });
});
