import { NextResponse } from "next/server";
import { getCommerceDb } from "@/lib/infrastructure/turso/runtime";
import { ensureSolanaPaymentRuntimeStarted } from "../../runtime";
import {
  registerSolanaReference,
  validateReferenceRequest,
  type ReferenceRegistrationRequest,
} from "../../use-cases/register-reference";

export async function handleRegisterSolanaReferencePost(req: Request): Promise<Response> {
  try {
    ensureSolanaPaymentRuntimeStarted();
    const body = (await req.json().catch(() => ({}))) as ReferenceRegistrationRequest;
    const validated = validateReferenceRequest(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: validated.status });
    }

    const db = await getCommerceDb();
    const result = await registerSolanaReference(db, {
      metadata: validated.metadata,
      amountCents: validated.amountCents,
      currency: validated.currency,
      ttlSeconds: validated.ttlSeconds,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate reference address" },
      { status: 500 },
    );
  }
}
