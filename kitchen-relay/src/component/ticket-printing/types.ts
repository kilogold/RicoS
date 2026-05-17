export type CartLine = {
  id: string;
  quantity: number;
  selections: Record<string, string[]>;
  lineUnitTotalCents: number;
  lineExtendedTotalCents: number;
  itemLabel?: string;
  selectionLines?: string[];
};

export type PrinterAdapter = {
  /** Print ticket text (one logical ticket). */
  print(text: string): Promise<void>;
};

export type LpPrinterOptions = {
  /** `lp -d` */
  destination?: string;
  /** `lp -t` job title */
  title?: string;
};

export type ConsolePrinterOptions = {
  logFilePath?: string;
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
