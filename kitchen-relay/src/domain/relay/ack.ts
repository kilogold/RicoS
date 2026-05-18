export async function postPrintAck(params: {
  backendBase: string;
  printAckSecret?: string;
  printJobId: string;
}): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (params.printAckSecret?.trim()) {
    headers["X-Print-Ack-Key"] = params.printAckSecret.trim();
  }
  const res = await fetch(`${params.backendBase}/api/print/ack`, {
    method: "POST",
    headers,
    body: JSON.stringify({ printJobId: params.printJobId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`print-ack failed: ${res.status} ${text}`);
  }
}
