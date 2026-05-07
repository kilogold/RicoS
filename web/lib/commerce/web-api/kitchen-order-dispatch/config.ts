export function getPrintAckSecret(): string | undefined {
  return process.env.PRINT_ACK_SECRET?.trim();
}
