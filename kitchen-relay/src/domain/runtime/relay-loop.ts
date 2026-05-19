import http from "node:http";
import { startPrintJobPoller } from "../relay/poll-jobs";
import { startPrintBellConsumer } from "../relay/sqs-wakeup";
import type { PrintJobHandlerInput } from "../relay/types";

function resolveAwsRegion(queueUrl: string): string | undefined {
  const fromEnv = process.env.AWS_REGION?.trim();
  if (fromEnv) return fromEnv;
  const match = queueUrl.match(/sqs\.([a-z0-9-]+)\.amazonaws\.com/i);
  return match?.[1];
}

export function startRelayLoop(
  backendBase: string,
  relayPort: number,
  printAckSecret: string | undefined,
  pollIntervalMs: number,
  handlePrintJob: (job: PrintJobHandlerInput) => Promise<void>,
): void {
  const queueUrl = process.env.PRINT_BELL_QUEUE_URL?.trim();
  const sqsRegion = queueUrl ? resolveAwsRegion(queueUrl) : undefined;

  if (queueUrl) {
    if (!sqsRegion) {
      console.error(
        "PRINT_BELL_QUEUE_URL is set but AWS_REGION could not be determined (set AWS_REGION or use sqs.<region>.amazonaws.com in the URL)",
      );
      process.exit(1);
    }
    console.log(`PrintBell: SQS long-poll (${queueUrl})`);
    console.log(`Print jobs fetched from: ${backendBase}/api/print/jobs`);
  } else {
    console.log(`Printing relay polling jobs: ${backendBase}/api/print/jobs (every ${pollIntervalMs}ms)`);
  }

  console.log(`Print ack URL: ${backendBase}/api/print/ack`);
  console.log(`Health: http://127.0.0.1:${relayPort}/health`);

  const healthServer = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  healthServer.listen(relayPort, "127.0.0.1");

  function onPollError(err: unknown): void {
    console.error("Print jobs poll error:", err);
  }

  if (queueUrl && sqsRegion) {
    startPrintBellConsumer({
      queueUrl,
      region: sqsRegion,
      backendBase,
      printAckSecret,
      handlePrintJob,
      onError: onPollError,
    });
  } else {
    startPrintJobPoller({
      backendBase,
      printAckSecret,
      intervalMs: pollIntervalMs,
      handlePrintJob,
      onError: onPollError,
    });
  }
}
