import { createIpPrinterAdapter, type PrintOptions } from "../src/component/ticket-printing/service";

const options: PrintOptions = {};
const host = process.env.KITCHEN_IP_PRINTER_HOST?.trim();
const port = process.env.KITCHEN_IP_PRINTER_PORT?.trim();

if (!host) {
  console.error("Missing KITCHEN_IP_PRINTER_HOST");
  process.exit(1);
}
options.host = host;

if (port) {
  const parsedPort = Number.parseInt(port, 10);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    console.error(`Invalid KITCHEN_IP_PRINTER_PORT: ${port}`);
    process.exit(1);
  }
  options.port = parsedPort;
}

const printerHost = options.host;
const printerPort = options.port ?? 9100;

const sampleReceipt = [
  "RICOS - KITCHEN TICKET",
  "--------------------------------",
  "Ref: EvdsKxJhfQdX6b6DGMqy1pWqgdobESikgA8ENaMHMFrj",
  "Time: 2026-05-12T16:43:12.895Z",
  "Name: Test Customer",
  "Service: DINE-IN",
  "--------------------------------",
  "1x Farina",
  "   Base: Milk",
  "   Sugar: Sugar",
  "   Garnish: None",
  "--------------------------------",
  "TOTAL:                 $3.99",
  "--------------------------------",
  "",
].join("\n");

console.log(`Preparing ESC/POS test receipt for ${printerHost}:${printerPort}`);
console.log(`Receipt text length: ${sampleReceipt.length} characters`);
console.log("Opening TCP connection and sending raw printer bytes...");

try {
  await createIpPrinterAdapter(options).print(sampleReceipt);
  console.log(`Sent test receipt to ${printerHost}:${printerPort}`);
} catch (error) {
  console.error(`Failed to print test receipt to ${printerHost}:${printerPort}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
