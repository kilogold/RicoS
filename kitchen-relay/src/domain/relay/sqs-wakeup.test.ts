import { describe, expect, test } from "bun:test";
import {
  BACKOFF_INITIAL_MS,
  BACKOFF_MAX_MS,
  SQS_CONNECTION_TIMEOUT_MS,
  SQS_REQUEST_TIMEOUT_MS,
  SQS_REQUEST_TIMEOUT_SLACK_MS,
  WAIT_TIME_MS,
  createPrintBellSqsClient,
  nextBackoffMs,
  runPrintBellWakeCycle,
} from "./sqs-wakeup";

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

describe("SQS long-poll timeout wiring", () => {
  test("requestTimeout is wait window plus slack", () => {
    expect(SQS_REQUEST_TIMEOUT_MS).toBe(WAIT_TIME_MS + SQS_REQUEST_TIMEOUT_SLACK_MS);
  });

  test("createPrintBellSqsClient configures NodeHttpHandler timeouts", async () => {
    const client = createPrintBellSqsClient("us-east-1");
    const handler = client.config.requestHandler as {
      configProvider?: Promise<{
        connectionTimeout?: number;
        requestTimeout?: number;
      }>;
    };
    const cfg = await handler.configProvider;
    expect(cfg?.connectionTimeout).toBe(SQS_CONNECTION_TIMEOUT_MS);
    expect(cfg?.requestTimeout).toBe(SQS_REQUEST_TIMEOUT_MS);
  });
});

describe("nextBackoffMs", () => {
  test("doubles then caps at BACKOFF_MAX_MS", () => {
    expect(nextBackoffMs(BACKOFF_INITIAL_MS)).toBe(2_000);
    expect(nextBackoffMs(2_000)).toBe(4_000);
    expect(nextBackoffMs(32_000)).toBe(BACKOFF_MAX_MS);
    expect(nextBackoffMs(BACKOFF_MAX_MS)).toBe(BACKOFF_MAX_MS);
  });
});
