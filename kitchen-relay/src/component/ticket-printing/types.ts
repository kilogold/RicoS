/**
 * Formatter-local ticket line — not `PurchaseOrderLine` so layout stays decoupled from
 * commerce fields (modifiers, station, etc.). Map explicitly via `toCartLines`.
 */
export type CartLine = {
  id: string;
  quantity: number;
  selections: Record<string, string[]>;
  lineUnitTotalCents: number;
  lineExtendedTotalCents: number;
  itemLabel: string;
  selectionLines: string[];
};

export type PrinterAdapter = {
  /** Print ticket text (one logical ticket). */
  print(text: string): Promise<void>;
};

export type LpPrinterOptions = {
  /** `lp -d` queue name */
  destination?: string;
};

export type ConsolePrinterOptions = {
  logFilePath?: string;
  /** Prefix each ticket in stdout/log (e.g. `Printer A`). */
  label?: string;
};

export type PrintOptions = {
  host?: string;
  port?: number;
  encoding?: BufferEncoding;
  feedLines?: number;
  cut?: boolean;
  timeoutMs?: number;
};

export type PrintRetryOptions = {
  maxAttempts: number;
  initialDelayMs: number;
};
