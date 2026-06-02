import { invalidateAndWarmMenuCache } from "@/lib/commerce/web-api/staff-order-management/lib/menu-cache-invalidation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RevalidateBody = {
  catalogVersion?: unknown;
};

export async function POST(req: Request) {
  let body: RevalidateBody = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      body = JSON.parse(text) as RevalidateBody;
    }
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  let expectedCatalogVersion: number | undefined;
  if (body.catalogVersion !== undefined) {
    if (typeof body.catalogVersion !== "number" || !Number.isInteger(body.catalogVersion)) {
      return NextResponse.json({ error: "catalogVersion must be an integer" }, { status: 400 });
    }
    expectedCatalogVersion = body.catalogVersion;
  }

  try {
    const result = await invalidateAndWarmMenuCache({ expectedCatalogVersion });
    return NextResponse.json({ ok: true, version: result.version });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
