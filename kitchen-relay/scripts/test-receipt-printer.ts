import { createIpPrinterAdapter, type PrintOptions } from "../src/component/ticket-printing/service";

const host = process.env.KITCHEN_IP_PRINTER_A_HOST?.trim();
if (!host) {
  console.error("Missing KITCHEN_IP_PRINTER_A_HOST");
  process.exit(1);
}
const options: PrintOptions = { host, port: 9100 };
const printerHost = host;
const printerPort = 9100;

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
