import http from "node:http";
import PQueue from "p-queue";
import { subscribeOrderPaidStream } from "../relay/stream";
import type { OrderPaidPayload } from "../relay/types";

export function startRelayLoop(
  backendBase: string,
  relayPort: number,
  handleOrderPaid: (payload: OrderPaidPayload) => Promise<void>,
): void {

  const streamUrl = `${backendBase}/api/events/stream`;
  console.log(`Printing relay subscribing to SSE: ${streamUrl}`);
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

  // Concurrency=1 guarantees FIFO processing for paid-order events.
  const orderQueue = new PQueue({ concurrency: 1 });

  function onOrderPaid(payload: OrderPaidPayload): void {
    orderQueue.add(() => handleOrderPaid(payload)).catch((err: unknown) => {
      console.error("Queued order processing failed:", err);
    });
  }

  function onStreamError(err: unknown): void {
    console.error("SSE error / reconnecting:", err);
  }

  subscribeOrderPaidStream(backendBase, onOrderPaid, onStreamError);
}
