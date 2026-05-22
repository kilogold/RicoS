declare module "tsscmp" {
  /** Timing-safe string comparison (double-HMAC pattern). */
  export default function compare(a: string, b: string): boolean;
}
