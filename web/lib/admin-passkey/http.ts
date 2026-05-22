import { NextResponse } from "next/server";

export async function readJsonBody<T extends Record<string, unknown>>(
  req: Request,
): Promise<{ ok: true; body: T } | { ok: false; response: Response }> {
  try {
    const body = (await req.json()) as T;
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_json" }, { status: 400 }),
    };
  }
}

export function jsonError(error: string, status: number, detail?: string): Response {
  const payload: Record<string, string> = { error };
  if (detail) payload.detail = detail;
  return NextResponse.json(payload, { status });
}
