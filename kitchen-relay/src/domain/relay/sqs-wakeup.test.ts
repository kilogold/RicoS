import { describe, expect, test } from "bun:test";
import { runPrintBellWakeCycle } from "./sqs-wakeup";

describe("runPrintBellWakeCycle", () => {
  test("calls deleteMessage when runFetchOnce succeeds", async () => {
    let deleted = false;
    await runPrintBellWakeCycle({
      runFetchOnce: async () => {},
      deleteMessage: async () => {
        deleted = true;
      },
      onFetchError: () => {
        throw new Error("unexpected onFetchError");
      },
    });
    expect(deleted).toBe(true);
  });

  test("does not delete when runFetchOnce throws", async () => {
    let deleted = false;
    let sawError: unknown;
    await runPrintBellWakeCycle({
      runFetchOnce: async () => {
        throw new Error("print-jobs fetch failed");
      },
      deleteMessage: async () => {
        deleted = true;
      },
      onFetchError: (err) => {
        sawError = err;
      },
    });
    expect(deleted).toBe(false);
    expect(sawError).toBeInstanceOf(Error);
    expect((sawError as Error).message).toBe("print-jobs fetch failed");
  });
});
