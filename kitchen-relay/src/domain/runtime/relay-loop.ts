import http from "node:http";
import PQueue from "p-queue";
import { startPrintJobPoller, type PrintJob } from "../relay/poll-jobs";
import type { PrintJobHandlerInput } from "../relay/types";

export function startRelayLoop(
  backendBase: string,
  relayPort: number,
  printAckSecret: string | undefined,
  pollIntervalMs: number,
  handlePrintJob: (job: PrintJobHandlerInput) => Promise<void>,
): void {
  console.log(`Printing relay polling jobs: ${backendBase}/api/print/jobs (every ${pollIntervalMs}ms)`);
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

  const orderQueue = new PQueue({ concurrency: 1 });

  function onPrintJob(job: PrintJob): void {
    orderQueue
      .add(() => handlePrintJob({ printJobId: job.printJobId, payload: job.payload }))
      .catch((err: unknown) => {
        console.error("Print job failed (will retry on next poll):", err);
      });
  }

  function onPollError(err: unknown): void {
    console.error("Print jobs poll error:", err);
  }

  startPrintJobPoller({
    backendBase,
    printAckSecret,
    intervalMs: pollIntervalMs,
    onJob: onPrintJob,
    onError: onPollError,
  });
}
