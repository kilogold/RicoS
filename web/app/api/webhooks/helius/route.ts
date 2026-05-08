import { handleHeliusWebhookRequest } from "@/lib/commerce/web-api/solana-payment/adapters/http";
import { after } from "next/server";
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
    const headers = headersToRecord(req.headers);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      console.error("Invalid JSON body in Helius webhook"); 
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    console.log("Helius webhook received.", headers, body);


    after(async () => {
        console.log("Starting [after] Helius webhook handler...");
        await handleHeliusWebhookRequest(headers, body);
    });

    return Response.json({ received: true });
}
