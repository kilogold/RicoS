import { NextResponse } from "next/server";
import { getHeliusIngressConfig, getWebhookDb } from "@/lib/webhook-backend/runtime";
import { parseHeliusIngressPayload } from "@/lib/webhook-backend/ingress/helius-adapter";
import { executeIngressEvent } from "@/lib/webhook-backend/ingress/execute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const heliusDebug = process.env.HELIUS_WEBHOOK_DEBUG?.trim() === "1";
const heliusWebhookEnabled = process.env.HELIUS_WEBHOOK_ENABLED?.trim() === "1";

function headersToRecord(headers: Headers): Record<string, string | string[] | undefined> {
  const record: Record<string, string | undefined> = {};
  for (const [key, value] of headers.entries()) {
    record[key.toLowerCase()] = value;
  }
  return record;
}

export async function POST(req: Request) {
  if (!heliusWebhookEnabled) {
    if (heliusDebug) {
      console.info("Helius webhook received while disabled; ignoring request.");
    }
    return NextResponse.json({ received: true, ignored: true, reason: "webhook_disabled" });
  }

  const startedAt = Date.now();
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

  if (heliusDebug || parsed.ignoredCount > 0) {
    console.info("Helius ingress parsed:", {
      processed: parsed.events.length,
      ignored: parsed.ignoredCount,
      ignoredDetails: parsed.ignoredDetails.slice(0, 5),
    });
  }

  for (const event of parsed.events) {
    if (heliusDebug) {
      console.info("Helius ingress normalized event:", {
        ingressEventId: event.ingressEventId,
        paymentReferenceId: event.paymentReferenceId,
        amountCents: event.amountCents,
        currency: event.currency,
      });
    }
    const outcome = await executeIngressEvent(db, event);
    if (!outcome.ok) {
      console.error("Helius ingress processing failed:", {
        ingressEventId: event.ingressEventId,
        status: outcome.status,
        body: outcome.body,
      });
      return NextResponse.json(outcome.body, { status: outcome.status });
    }
  }

  if (heliusDebug) {
    console.info("Helius ingress request completed:", {
      processed: parsed.events.length,
      ignored: parsed.ignoredCount,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return NextResponse.json({
    received: true,
    processed: parsed.events.length,
    ignored: parsed.ignoredCount,
  });
}
