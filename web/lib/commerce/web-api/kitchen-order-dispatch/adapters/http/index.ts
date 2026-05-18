import { NextResponse } from "next/server";
import {
  ackPrintJob,
  listPrintJobsHydrated,
} from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import { getPrintAckSecret } from "../../config";

function verifyPrintRelayAuth(req: Request): boolean {
  const printAckSecret = getPrintAckSecret();
  if (!printAckSecret) {
    return true;
  }
  const key = req.headers.get("x-print-ack-key");
  return key === printAckSecret;
}

export async function handlePrintJobsRequest(req: Request): Promise<Response> {
  if (!verifyPrintRelayAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let db;
  try {
    db = await getWebhookDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Print jobs misconfiguration:", message);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const jobs = await listPrintJobsHydrated(db);
  return NextResponse.json({ jobs });
}

export async function handlePrintAckRequest(req: Request): Promise<Response> {
  if (!verifyPrintRelayAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let db;
  try {
    db = await getWebhookDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Print ack misconfiguration:", message);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  let body: { printJobId?: unknown };
  try {
    body = (await req.json()) as { printJobId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const printJobId = body.printJobId;
  if (typeof printJobId !== "string" || !printJobId.trim()) {
    return NextResponse.json({ error: "Invalid printJobId" }, { status: 400 });
  }

  await ackPrintJob(db, printJobId.trim());
  return NextResponse.json({ ok: true });
}
