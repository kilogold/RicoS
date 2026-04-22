import { NextResponse } from "next/server";
import { getHeliusIngressConfig, getWebhookDb } from "@/lib/webhook-backend/runtime";
import { parseHeliusIngressPayload } from "@/lib/webhook-backend/ingress/helius-adapter";
import { executeIngressEvent } from "@/lib/webhook-backend/ingress/execute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function headersToRecord(headers: Headers): Record<string, string | string[] | undefined> {
  const record: Record<string, string | undefined> = {};
  for (const [key, value] of headers.entries()) {
    record[key.toLowerCase()] = value;
  }
  return record;
}

export async function POST(req: Request) {
  let db;
  let heliusConfig;
  try {
    db = await getWebhookDb();
    heliusConfig = getHeliusIngressConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Helius webhook misconfiguration:", message);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseHeliusIngressPayload({
    body,
    headers: headersToRecord(req.headers),
    config: heliusConfig,
  });

  if (parsed.kind === "error") {
    console.error("Helius ingress rejected:", parsed.message);
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }

  for (const event of parsed.events) {
    const outcome = await executeIngressEvent(db, event);
    if (!outcome.ok) {
      return NextResponse.json(outcome.body, { status: outcome.status });
    }
  }

  return NextResponse.json({
    received: true,
    processed: parsed.events.length,
    ignored: parsed.ignoredCount,
  });
}
