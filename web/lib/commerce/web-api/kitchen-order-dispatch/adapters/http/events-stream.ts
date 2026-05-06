import { listPending, type KitchenOrderPayload } from "@/lib/infrastructure/turso/commerce-db";
import { getCommerceDb } from "@/lib/infrastructure/turso/runtime";
import { subscribeOrderPaid } from "@/lib/infrastructure/sse/order-paid-bus";
import { ensureSolanaPaymentRuntimeStarted } from "@/lib/commerce/web-api/solana-payment/runtime";

function formatEvent(event: string, payload: KitchenOrderPayload): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function handleKitchenEventsStreamGet(req: Request): Promise<Response> {
  ensureSolanaPaymentRuntimeStarted();
  let db;
  try {
    db = await getCommerceDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("SSE stream misconfiguration:", message);
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
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
        if (sentEventIds.has(payload.stripeEventId)) return;
        sentEventIds.add(payload.stripeEventId);
        safeEnqueue(formatEvent("order.paid", payload));
      };

      const replayPending = async (): Promise<void> => {
        const pending = await listPending(db);
        for (const row of pending) {
          pushOrderIfNew(row);
        }
      };

      const unsubscribe = subscribeOrderPaid(pushOrderIfNew);

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
