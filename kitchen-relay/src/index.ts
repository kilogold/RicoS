import { startRelayLoop } from "./domain/runtime/relay-loop";
import { createPrintJobHandler } from "./domain/runtime/order-paid-handler";
import { resolvePrinterAdapters, type PrinterAdapterKind } from "./domain/runtime/printer-setup";

const backendBase = (
  process.env.KITCHEN_BACKEND_BASE_URL ||
  "http://127.0.0.1:3000"
).replace(/\/$/, ""); // avoid double-slash in endpoint joins.
const printAckSecret = process.env.PRINT_ACK_SECRET?.trim();
const logFilePath = process.env.KITCHEN_PRINT_LOG;
const printerAdapterEnv = process.env.KITCHEN_PRINTER_ADAPTER?.trim();
const kitchenRelayPortRaw = process.env.KITCHEN_RELAY_PORT?.trim();
const hostA = process.env.KITCHEN_IP_PRINTER_A_HOST?.trim();
const hostB = process.env.KITCHEN_IP_PRINTER_B_HOST?.trim();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const normalized = raw?.trim();
  if (!normalized) {
    console.warn(`Missing positive integer value, using fallback ${fallback}`);
    return fallback;
  }
  const num = Number.parseInt(normalized, 10);
  if (!Number.isFinite(num) || num <= 0) {
    console.warn(`Invalid positive integer "${normalized}", using fallback ${fallback}`);
    return fallback;
  }
  return num;
}

const printMaxAttempts = parsePositiveInt(process.env.KITCHEN_PRINT_MAX_ATTEMPTS, 5);
const printRetryInitialDelayMs = parsePositiveInt(
  process.env.KITCHEN_PRINT_RETRY_INITIAL_DELAY_MS,
  200,
);
const pollIntervalMs = parsePositiveInt(process.env.KITCHEN_PRINT_POLL_INTERVAL_MS, 10_000);

if (
  !printerAdapterEnv ||
  (printerAdapterEnv !== "lp" && printerAdapterEnv !== "console" && printerAdapterEnv !== "ip")
) {
  console.error("KITCHEN_PRINTER_ADAPTER must be set to lp, console, or ip");
  process.exit(1);
}

const adapterKind = printerAdapterEnv as PrinterAdapterKind;

let printers;
try {
  printers = resolvePrinterAdapters({
    kind: adapterKind,
    logFilePath,
    hostA,
    hostB,
  });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
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

console.log(`Printer adapter: ${printerAdapterEnv}`);
if (printers.printerB) {
  console.log("Kitchen relay: dual-printer mode");
}
if (process.env.PRINT_BELL_QUEUE_URL?.trim()) {
  console.log("Kitchen relay mode: PrintBell SQS wakeup");
} else {
  console.log(`Kitchen relay mode: HTTP interval poll (${pollIntervalMs}ms); set PRINT_BELL_QUEUE_URL for SQS`);
}

const handlePrintJob = createPrintJobHandler(
  printers,
  printMaxAttempts,
  printRetryInitialDelayMs,
  backendBase,
  printAckSecret,
);

startRelayLoop(backendBase, relayPort, printAckSecret, pollIntervalMs, handlePrintJob);
