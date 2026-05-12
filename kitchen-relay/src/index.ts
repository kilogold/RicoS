import {
  createConsolePrinterAdapter,
  createIpPrinterAdapter,
  createLpPrinterAdapter,
} from "./component/ticket-printing/service";
import { createSqliteIdempotencyStore, resolveIdempotencyStorePath } from "./domain/idempotency";
import { startRelayLoop } from "./domain/runtime/relay-loop";
import { createOrderPaidHandler } from "./domain/runtime/order-paid-handler";

const backendBase = (
  process.env.KITCHEN_BACKEND_BASE_URL ||
  "http://127.0.0.1:3000"
).replace(/\/$/, ""); // avoid double-slash in endpoint joins.
const printAckSecret = process.env.PRINT_ACK_SECRET?.trim();
const logFilePath = process.env.KITCHEN_PRINT_LOG;
const printerAdapterEnv = process.env.KITCHEN_PRINTER_ADAPTER;
const deadLetterPath = process.env.KITCHEN_PRINT_DEAD_LETTER?.trim() || undefined;
const idempotencyPath = resolveIdempotencyStorePath(process.env.KITCHEN_IDEMPOTENCY_STORE);
const kitchenRelayPortRaw = process.env.KITCHEN_RELAY_PORT?.trim();
const ipPrinterHost = process.env.KITCHEN_IP_PRINTER_HOST?.trim();
const ipPrinterPortRaw = process.env.KITCHEN_IP_PRINTER_PORT?.trim();

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

if (
  !printerAdapterEnv ||
  (printerAdapterEnv !== "lp" && printerAdapterEnv !== "console" && printerAdapterEnv !== "ip")
) {
  console.error("KITCHEN_PRINTER_ADAPTER must be set to lp, console, or ip");
  process.exit(1);
}

if (printerAdapterEnv === "ip" && !ipPrinterHost) {
  console.error("KITCHEN_IP_PRINTER_HOST must be set when KITCHEN_PRINTER_ADAPTER=ip");
  process.exit(1);
}

const printer =
  printerAdapterEnv === "console"
    ? createConsolePrinterAdapter({ logFilePath })
    : printerAdapterEnv === "ip"
      ? createIpPrinterAdapter({
          host: ipPrinterHost,
          port: ipPrinterPortRaw ? parsePositiveInt(ipPrinterPortRaw, 9100) : undefined,
        })
    : createLpPrinterAdapter({
        destination: process.env.KITCHEN_PRINTER_NAME?.trim() || undefined,
        title: process.env.KITCHEN_PRINTER_TITLE?.trim() || undefined,
      });
const idempotency = createSqliteIdempotencyStore(idempotencyPath);

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
console.log(`Idempotency store: ${idempotencyPath}`);

const handleOrderPaid = createOrderPaidHandler(
  idempotency,
  printer,
  printMaxAttempts,
  printRetryInitialDelayMs,
  backendBase,
  printAckSecret,
  deadLetterPath,
);

startRelayLoop(backendBase, relayPort, handleOrderPaid);
