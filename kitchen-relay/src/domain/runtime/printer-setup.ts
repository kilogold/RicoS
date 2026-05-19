import {
  createConsolePrinterAdapter,
  createIpPrinterAdapter,
  createLpPrinterAdapter,
  type PrinterAdapter,
} from "../../component/ticket-printing/service";
import type { PrintJobPrinters } from "./order-paid-handler";

const IP_PRINTER_PORT = 9100;

export type PrinterAdapterKind = "console" | "lp" | "ip";

export function resolvePrinterAdapters(params: {
  kind: PrinterAdapterKind;
  logFilePath?: string;
  hostA?: string;
  hostB?: string;
}): PrintJobPrinters {
  const hostA = params.hostA?.trim();
  const hostB = params.hostB?.trim();
  const printerB = hostB ? createAdapter(params.kind, hostB, "Printer B", params.logFilePath) : null;

  if (params.kind === "console") {
    const printerA = createAdapter(params.kind, hostA, printerB ? "Printer A" : undefined, params.logFilePath);
    if (!printerB) {
      console.log("Kitchen relay: single-printer mode (console)");
    }
    return { printerA, printerB };
  }

  if (!hostA) {
    throw new Error("KITCHEN_IP_PRINTER_A_HOST must be set when KITCHEN_PRINTER_ADAPTER=ip or lp");
  }

  const printerA = createAdapter(params.kind, hostA, "Printer A", params.logFilePath);
  if (!printerB) {
    console.log("Kitchen relay: single-printer mode");
  }
  return { printerA, printerB };
}

function createAdapter(
  kind: PrinterAdapterKind,
  host: string | undefined,
  label: string | undefined,
  logFilePath?: string,
): PrinterAdapter {
  if (kind === "console") {
    return createConsolePrinterAdapter({ logFilePath, label });
  }
  if (kind === "ip") {
    if (!host) {
      throw new Error("Missing IP printer host");
    }
    return createIpPrinterAdapter({ host, port: IP_PRINTER_PORT });
  }
  if (!host) {
    throw new Error("Missing lp printer destination");
  }
  return createLpPrinterAdapter({ destination: host });
}
