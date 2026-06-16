import { handleAthMovilWebhookRequest } from "@/lib/commerce/web-api/ath-movil/adapters/http/webhook";
import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    console.error("Invalid JSON body in ATH Móvil webhook");
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  after(async () => {
    await handleAthMovilWebhookRequest(body);
  });

  return Response.json({ received: true });
}
