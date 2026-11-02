import { ORDERING_PATH } from "@/lib/navigation/routes";
import { type NextRequest, NextResponse } from "next/server";
import {
  getStoreSession,
  shoppingEnabled,
  storeClosedResponse,
} from "@/lib/commerce/domain/store-hours";

export function proxy(req: NextRequest) {
  const session = getStoreSession(new Date());
  if (shoppingEnabled(session)) return NextResponse.next();

  const { pathname } = req.nextUrl;

  if (pathname === "/checkout" && (req.method === "GET" || req.method === "HEAD")) {
    return NextResponse.redirect(new URL(ORDERING_PATH, req.url));
  }

  if (
    (
      pathname === "/api/create-payment-intent" ||
      pathname === "/api/solana-pay/reference" ||
      pathname === "/api/ath-movil/reference"
    ) &&
    req.method === "POST"
  ) {
    return storeClosedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/checkout",
    "/api/create-payment-intent",
    "/api/solana-pay/reference",
    "/api/ath-movil/reference",
  ],
};
