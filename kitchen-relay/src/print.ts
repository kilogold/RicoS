import { spawn } from "node:child_process";
import {
  getItemById,
  getSelectionDisplayLines,
  resolveLocalizedText,
  type LineSelections,
} from "@ricos/shared";

export type CartLine = { id: string; quantity: number; selections: LineSelections };

export type PrinterAdapter = {
  /** Print ticket text (one logical ticket). */
  print(text: string): Promise<void>;
};

export function formatTicket(params: {
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  lines: CartLine[];
  printedAt: Date;
}): string {
  const { paymentIntentId, amountCents, currency, lines, printedAt } = params;
  const divider = "--------------------------------";
  const rows: string[] = [
    "RICOS — KITCHEN TICKET",
    divider,
    `PI: ${paymentIntentId}`,
    `Time: ${printedAt.toISOString()}`,
    divider,
  ];

  for (const line of lines) {
    const item = getItemById(line.id);
    const label = item ? resolveLocalizedText(item.name, "en") : line.id;
    rows.push(`${line.quantity}x ${label}`);
    const selectionRows = getSelectionDisplayLines(line.id, line.selections, "en");
    for (const selection of selectionRows) {
      rows.push(`   ${selection}`);
    }
  }

  rows.push(divider);
  rows.push(`TOTAL: ${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`);
  rows.push(divider);
  rows.push("");

  return rows.join("\n");
}

export type LpPrinterOptions = {
  /** `lp -d` */
  destination?: string;
  /** `lp -t` job title */
  title?: string;
};

/**
 * Prints via CUPS `lp`. On successful submission, mirrors the same text to stdout once.
 */
export function createLpPrinterAdapter(options: LpPrinterOptions = {}): PrinterAdapter {
  return {
    async print(text: string): Promise<void> {
      const args: string[] = [];
      if (options.destination) {
        args.push("-d", options.destination);
      }
      if (options.title) {
        args.push("-t", options.title);
      }
      await runLp(args, text);
      console.log(text);
    },
  };
}

function runLp(args: string[], stdin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("lp", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `lp exited with code ${code}`));
      }
    });
    child.stdin?.write(stdin, "utf8", (err) => {
      if (err) {
        reject(err);
        return;
      }
      child.stdin?.end();
    });
  });
}

export type ConsolePrinterOptions = {
  logFilePath?: string;
};

export function createConsolePrinterAdapter(options: ConsolePrinterOptions = {}): PrinterAdapter {
  return {
    async print(text: string): Promise<void> {
      console.log(text);
      if (options.logFilePath) {
        const fs = await import("node:fs/promises");
        await fs.appendFile(options.logFilePath, text + "\n", "utf8");
      }
    },
  };
}

export type PrintRetryOptions = {
  maxAttempts: number;
  initialDelayMs: number;
};

export async function printWithRetries(
  adapter: PrinterAdapter,
  text: string,
  retries: PrintRetryOptions,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries.maxAttempts; attempt += 1) {
    try {
      await adapter.print(text);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < retries.maxAttempts - 1) {
        const delay = retries.initialDelayMs * 2 ** attempt;
        await sleep(delay);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function appendDeadLetter(
  path: string,
  text: string,
  meta: { eventId: string; message: string },
): Promise<void> {
  const fs = await import("node:fs/promises");
  const block = [
    `--- dead-letter ${new Date().toISOString()} event=${meta.eventId} ---`,
    meta.message,
    text,
    "",
  ].join("\n");
  await fs.appendFile(path, block + "\n", "utf8");
}
