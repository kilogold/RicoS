import { requireStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";
import {
  MENU_FALLBACK_THUMBNAIL_PATHNAME,
  MENU_THUMBNAIL_BLOB_PREFIX,
} from "@ricos/shared";
import { del, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function jsonError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

/** Staff auth + Blob RW token, or an error Response. */
function requireAuthAndToken(req: Request): string | Response {
  const unauthorized = requireStaffPublishAuth(req);
  if (unauthorized) return unauthorized;

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return jsonError("blob_credentials_missing", 500);
  
  return token;
}

function parsePathnameParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const pathname = raw.trim();
  return pathname || null;
}

export async function GET(req: Request) {
  const tokenOrError = requireAuthAndToken(req);
  if (typeof tokenOrError !== "string") return tokenOrError;

  try {
    const blobs: { pathname: string; url: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({
        prefix: MENU_THUMBNAIL_BLOB_PREFIX,
        cursor,
        token: tokenOrError,
      });
      for (const blob of page.blobs) {
        blobs.push({ pathname: blob.pathname, url: blob.url });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    return NextResponse.json({ blobs });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "blob_list_failed", 500);
  }
}

export async function POST(req: Request) {
  const tokenOrError = requireAuthAndToken(req);
  if (typeof tokenOrError !== "string") return tokenOrError;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("invalid_multipart", 400);
  }

  const itemIdRaw = form.get("itemId");
  const file = form.get("file");
  if (typeof itemIdRaw !== "string" || !itemIdRaw.trim()) {
    return jsonError("itemId_required", 400);
  }
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("file_required", 400);
  }

  const contentType = file.type;
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return jsonError("unsupported_media_type", 400);
  }

  try {
    const blob = await put(`${MENU_THUMBNAIL_BLOB_PREFIX}${itemIdRaw.trim()}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType,
      token: tokenOrError,
    });
    return NextResponse.json({ pathname: blob.pathname, url: blob.url });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "blob_put_failed", 500);
  }
}

export async function DELETE(req: Request) {
  const tokenOrError = requireAuthAndToken(req);
  if (typeof tokenOrError !== "string") return tokenOrError;

  const url = new URL(req.url);
  let pathname = parsePathnameParam(url.searchParams.get("pathname"));
  if (!pathname) {
    try {
      const body = (await req.json()) as { pathname?: unknown };
      pathname = parsePathnameParam(body.pathname);
    } catch {
      pathname = null;
    }
  }

  if (!pathname) {
    return jsonError("pathname_required", 400);
  }
  if (!pathname.startsWith(MENU_THUMBNAIL_BLOB_PREFIX)) {
    return jsonError("pathname_outside_prefix", 400);
  }
  if (pathname === MENU_FALLBACK_THUMBNAIL_PATHNAME) {
    return jsonError("fallback_undeletable", 400);
  }

  try {
    await del(pathname, { token: tokenOrError });
  } catch {
    // Idempotent: already gone is success.
  }

  return NextResponse.json({ ok: true });
}
