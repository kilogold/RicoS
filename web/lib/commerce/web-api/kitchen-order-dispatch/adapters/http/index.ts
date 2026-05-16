import { NextResponse } from "next/server";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import { isValidPaymentIngressEventId } from "@/lib/commerce/domain";
import { type KitchenOrderIntent, isKitchenOrderIntent } from "@ricos/shared";
import { subscribeOrder } from "@/lib/infrastructure/sse/order-paid-bus";
import {
  listPaidPurchaseOrdersForKitchen,
  markPurchaseOrderAcknowledged,
} from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import { getPrintAckSecret } from "../../config";

function formatEvent(event: string, payload: KitchenOrderPayload): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function kitchenSseDedupKey(payload: KitchenOrderPayload): string {
  return `${payload.paymentIngressEventId}:${payload.intent}`;
}

export async function handleKitchenOrderEventStream(req: Request): Promise<Response> {
  let db;
  try {
    db = await getWebhookDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("SSE stream misconfiguration:", message);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sentEventIds = new Set<string>();
      let closed = false;
      let polling = false;

      const safeEnqueue = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      const pushOrderIfNew = (payload: KitchenOrderPayload): void => {
        if (payload.intent !== "manual-print") {
          const dedupKey = kitchenSseDedupKey(payload);
          if (sentEventIds.has(dedupKey)) return;
          sentEventIds.add(dedupKey);
        }
        safeEnqueue(formatEvent("order.paid", payload));
      };

      const replayPending = async (): Promise<void> => {
        const pending = await listPaidPurchaseOrdersForKitchen(db);
        for (const row of pending) {
          pushOrderIfNew(row);
        }
      };

      const unsubscribe = subscribeOrder(pushOrderIfNew);

      const keepAliveTimer = setInterval(() => {
        safeEnqueue(": ping\n\n");
      }, 25_000);

      const pollTimer = setInterval(async () => {
        if (polling || closed) return;
        polling = true;
        try {
          await replayPending();
        } catch (err) {
          console.error("SSE pending replay failed:", err);
        } finally {
          polling = false;
        }
      }, 5_000);

      const close = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(keepAliveTimer);
        clearInterval(pollTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      };

      req.signal.addEventListener("abort", close);

      try {
        await replayPending();
      } catch (err) {
        console.error("Initial SSE replay failed:", err);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function handlePrintAckRequest(req: Request): Promise<Response> {
  let db;
  try {
    db = await getWebhookDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Print ack misconfiguration:", message);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const printAckSecret = getPrintAckSecret();
  if (printAckSecret) {
    const key = req.headers.get("x-print-ack-key");
    if (key !== printAckSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { paymentIngressEventId?: unknown; intent?: unknown };
  try {
    body = (await req.json()) as { paymentIngressEventId?: unknown; intent?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const paymentIngressEventId = body.paymentIngressEventId;
  if (typeof paymentIngressEventId !== "string" || !isValidPaymentIngressEventId(paymentIngressEventId)) {
    return NextResponse.json({ error: "Invalid paymentIngressEventId" }, { status: 400 });
  }

  const intent = parsePrintAckIntent(body.intent);
  if (intent === null) {
    return NextResponse.json({ error: "Invalid intent" }, { status: 400 });
  }

  if (intent === "paid") {
    await markPurchaseOrderAcknowledged(db, paymentIngressEventId);
  }

  return NextResponse.json({ intent });
}

function parsePrintAckIntent(raw: unknown): KitchenOrderIntent | null {
  if (raw === undefined || raw === null) {
    return "paid";
  }
  return isKitchenOrderIntent(raw) ? raw : null;
}
