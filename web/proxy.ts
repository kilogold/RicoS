import { type NextRequest, NextResponse } from "next/server";
import {
  getStoreSession,
  shoppingEnabled,
  storeClosedResponse,
} from "@/lib/commerce/store-hours";

export function proxy(req: NextRequest) {
  const session = getStoreSession(new Date());
  if (shoppingEnabled(session)) return NextResponse.next();

  const { pathname } = req.nextUrl;

  if (pathname === "/checkout" && (req.method === "GET" || req.method === "HEAD")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (
    (pathname === "/api/create-payment-intent" || pathname === "/api/solana-pay/reference") &&
    req.method === "POST"
  ) {
    return storeClosedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/checkout", "/api/create-payment-intent", "/api/solana-pay/reference"],
};
