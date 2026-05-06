import { spawn } from "node:child_process";
import type { ConsolePrinterOptions, LpPrinterOptions, PrinterAdapter } from "./types";

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
