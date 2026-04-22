import http from "node:http";
import EventSource from "eventsource";
import {
  appendDeadLetter,
  createConsolePrinterAdapter,
  createLpPrinterAdapter,
  formatTicket,
  printWithRetries,
  type PrinterAdapter,
} from "./print.js";
import { createFileIdempotencyStore, resolveIdempotencyStorePath } from "./idempotency.js";

/** Must match `KitchenOrderPayload` from webhook-proxy `src/db.ts`. */
type OrderPaidPayload = {
  stripeEventId: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  lines: {
    id: string;
    quantity: number;
    selections: Record<string, string[]>;
    unitBasePriceCents: number;
    selectedModifiers: { groupId: string; optionId: string; optionSurchargeCents: number }[];
    lineUnitTotalCents: number;
    lineExtendedTotalCents: number;
  }[];
};

const proxyBase =
  process.env.KITCHEN_WEBHOOK_PROXY_URL?.replace(/\/$/, "") || "http://127.0.0.1:4001";
const printAckSecret = process.env.PRINT_ACK_SECRET?.trim();
const logFilePath = process.env.KITCHEN_PRINT_LOG;
const printerAdapterEnv = process.env.KITCHEN_PRINTER_ADAPTER;
const deadLetterPath = process.env.KITCHEN_PRINT_DEAD_LETTER?.trim() || undefined;
const idempotencyPath = resolveIdempotencyStorePath(process.env.KITCHEN_IDEMPOTENCY_STORE);
const kitchenRelayPortRaw = process.env.KITCHEN_RELAY_PORT?.trim();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const printMaxAttempts = parsePositiveInt(process.env.KITCHEN_PRINT_MAX_ATTEMPTS, 5);
const printRetryInitialDelayMs = parsePositiveInt(
  process.env.KITCHEN_PRINT_RETRY_INITIAL_DELAY_MS,
  200,
);

if (!printerAdapterEnv || (printerAdapterEnv !== "lp" && printerAdapterEnv !== "console")) {
  console.error("KITCHEN_PRINTER_ADAPTER must be set to lp or console");
  process.exit(1);
}

function createPrinter(): PrinterAdapter {
  if (printerAdapterEnv === "console") {
    return createConsolePrinterAdapter({ logFilePath });
  }
  return createLpPrinterAdapter({
    destination: process.env.KITCHEN_PRINTER_NAME?.trim() || undefined,
    title: process.env.KITCHEN_PRINTER_TITLE?.trim() || undefined,
  });
}

const printer = createPrinter();
const idempotency = createFileIdempotencyStore(idempotencyPath);

let processingChain = Promise.resolve();

function enqueueWork(fn: () => Promise<void>): Promise<void> {
  const next = processingChain.then(() => fn());
  processingChain = next.catch(() => {});
  return next;
}

async function postPrintAck(stripeEventId: string): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (printAckSecret) {
    headers["X-Print-Ack-Key"] = printAckSecret;
  }
  const res = await fetch(`${proxyBase}/print-ack`, {
    method: "POST",
    headers,
    body: JSON.stringify({ stripeEventId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`print-ack failed: ${res.status} ${text}`);
  }
}

async function handleOrderPaid(data: OrderPaidPayload): Promise<void> {
  const eventId = data.stripeEventId;

  if (await idempotency.isCommitted(eventId)) {
    try {
      await postPrintAck(eventId);
    } catch (err) {
      console.error("print-ack retry after idempotent skip failed:", err);
    }
    return;
  }

  const text = formatTicket({
    paymentIntentId: data.paymentIntentId,
    amountCents: data.amountCents,
    currency: data.currency,
    lines: data.lines,
    printedAt: new Date(),
  });

  try {
    await printWithRetries(printer, text, {
      maxAttempts: printMaxAttempts,
      initialDelayMs: printRetryInitialDelayMs,
    });
    await idempotency.markCommitted(eventId);
    await postPrintAck(eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Print failed after retries:", message);
    if (deadLetterPath) {
      try {
        await appendDeadLetter(deadLetterPath, text, {
          eventId,
          message,
        });
      } catch (dlErr) {
        console.error("Dead-letter write failed:", dlErr);
      }
    }
  }
}

if (!kitchenRelayPortRaw) {
  console.error("Missing KITCHEN_RELAY_PORT");
  process.exit(1);
}

const relayPort = Number(kitchenRelayPortRaw);
if (!Number.isInteger(relayPort) || relayPort <= 0 || relayPort > 65535) {
  console.error("KITCHEN_RELAY_PORT must be a valid TCP port (1-65535)");
  process.exit(1);
}

const streamUrl = `${proxyBase}/stream`;
console.log(`Printing relay subscribing to SSE: ${streamUrl}`);
console.log(`Print ack URL: ${proxyBase}/print-ack`);
console.log(`Printer adapter: ${printerAdapterEnv}`);
console.log(`Idempotency store: ${idempotencyPath}`);
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

const es = new EventSource(streamUrl);

es.addEventListener("order.paid", (msg) => {
  if (!msg.data) return;
  let data: OrderPaidPayload;
  try {
    data = JSON.parse(msg.data) as OrderPaidPayload;
  } catch {
    console.error("Invalid order.paid JSON");
    return;
  }
  if (
    typeof data.stripeEventId !== "string" ||
    typeof data.paymentIntentId !== "string" ||
    typeof data.amountCents !== "number" ||
    typeof data.currency !== "string" ||
    !Array.isArray(data.lines)
  ) {
    console.error("Invalid order.paid payload shape");
    return;
  }
  void enqueueWork(() => handleOrderPaid(data));
});

es.onerror = (err) => {
  console.error("SSE error / reconnecting:", err);
};
