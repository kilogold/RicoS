import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import type { ConsolePrinterOptions, LpPrinterOptions, PrintOptions, PrinterAdapter } from "./types";

// ESC @ initializes the printer, clearing transient modes before each ticket.
const ESC_POS_INITIALIZE = Buffer.from([0x1b, 0x40]);
// GS V 0 cuts the paper on XP-80 / POS-80C compatible printers.
const ESC_POS_CUT = Buffer.from([0x1d, 0x56, 0x00]);

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
      await runLp(args, text);
      console.log(text);
    },
  };
}

/**
 * Prints ESC/POS bytes directly to a thermal printer listening on raw TCP port 9100.
 */
export function createIpPrinterAdapter(options: PrintOptions = {}): PrinterAdapter {
  return {
    async print(text: string): Promise<void> {
      await printReceipt(text, options);
    },
  };
}

export function printReceipt(text: string, options: PrintOptions = {}): Promise<void> {
  const host = options.host?.trim();
  const port = options.port ?? 9100;
  const encoding = options.encoding ?? "ascii";
  const cut = options.cut ?? true;
  const feedLines = options.feedLines ?? 5;
  const timeoutMs = options.timeoutMs ?? 5_000;

  if (!host) {
    return Promise.reject(new Error("Missing IP printer host"));
  }

  const normalizedText = text.replace(/\r\n?/g, "\n");
  // LF advances paper one line; repeated before cutting so the blade clears the text.
  const feedBuffer = Buffer.alloc(feedLines, 0x0a);
  const payload = Buffer.concat([
    ESC_POS_INITIALIZE,
    Buffer.from(normalizedText, encoding),
    feedBuffer,
    ...(cut ? [ESC_POS_CUT] : []),
  ]);

  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    socket.setTimeout(timeoutMs, () => {
      finish(new Error(`Receipt printer timed out after ${timeoutMs}ms (${host}:${port})`));
    });
    socket.once("error", finish);
    socket.once("connect", () => {
      socket.write(payload, (error) => {
        if (error) {
          finish(error);
          return;
        }
        socket.end();
      });
    });
    socket.once("finish", () => {
      finish();
    });
  });
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

export function createConsolePrinterAdapter(options: ConsolePrinterOptions = {}): PrinterAdapter {
  return {
    async print(text: string): Promise<void> {
      const prefix = options.label ? `[${options.label}]\n` : "";
      console.log(`${prefix}${text}`);
      if (options.logFilePath) {
        const fs = await import("node:fs/promises");
        await fs.appendFile(options.logFilePath, prefix + text + "\n", "utf8");
      }
    },
  };
}
