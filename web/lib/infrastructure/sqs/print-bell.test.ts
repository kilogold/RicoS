import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let sendCalls: unknown[] = [];

mock.module("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    destroy = mock(() => {});
    send = mock((cmd: unknown) => {
      sendCalls.push(cmd);
      return Promise.resolve({});
    });
  },
  SendMessageCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

describe("notifyPrintBell", () => {
  beforeEach(() => {
    sendCalls = [];
    delete process.env.PRINT_BELL_QUEUE_URL;
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    delete process.env.PRINT_BELL_QUEUE_URL;
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.VERCEL;
  });

  test("no-ops when PRINT_BELL_QUEUE_URL is unset (local dev)", async () => {
    const { notifyPrintBell } = await import("./print-bell");
    await notifyPrintBell("job-1");
    expect(sendCalls.length).toBe(0);
  });

  test("throws on Vercel when PRINT_BELL_QUEUE_URL is unset", async () => {
    process.env.VERCEL = "1";
    const { notifyPrintBell } = await import("./print-bell");
    await expect(notifyPrintBell("job-1")).rejects.toThrow(/PRINT_BELL_QUEUE_URL/);
    expect(sendCalls.length).toBe(0);
  });

  test("throws when queue URL is set but region cannot be resolved", async () => {
    process.env.PRINT_BELL_QUEUE_URL = "https://example.com/not-sqs";
    const { notifyPrintBell } = await import("./print-bell");
    await expect(notifyPrintBell("job-1")).rejects.toThrow(/AWS_REGION/);
    expect(sendCalls.length).toBe(0);
  });

  test("sends JSON body when queue URL and region are set", async () => {
    process.env.PRINT_BELL_QUEUE_URL =
      "https://sqs.us-east-1.amazonaws.com/123456789012/PrintBell";
    process.env.AWS_REGION = "us-east-1";

    const { notifyPrintBell } = await import("./print-bell");
    await notifyPrintBell("550e8400-e29b-41d4-a716-446655440000");

    expect(sendCalls.length).toBe(1);
    const cmd = sendCalls[0] as { input?: { MessageBody?: string; QueueUrl?: string } };
    expect(cmd.input?.QueueUrl).toContain("PrintBell");
    expect(JSON.parse(cmd.input?.MessageBody ?? "{}")).toEqual({
      v: 1,
      printJobId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });
});
