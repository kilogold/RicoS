#!/usr/bin/env bun

const publicToken = process.env.NEXT_PUBLIC_ATH_MOVIL_PUBLIC_TOKEN?.trim();
const privateToken = process.env.ATH_MOVIL_PRIVATE_TOKEN?.trim();
const listenerURL = process.env.ATH_MOVIL_LISTENER_URL?.trim();

if (!publicToken) {
  console.error("Missing NEXT_PUBLIC_ATH_MOVIL_PUBLIC_TOKEN");
  process.exit(1);
}
if (!privateToken) {
  console.error("Missing ATH_MOVIL_PRIVATE_TOKEN");
  process.exit(1);
}
if (!listenerURL) {
  console.error("Missing ATH_MOVIL_LISTENER_URL");
  process.exit(1);
}

const res = await fetch("https://www.athmovil.com/transactions/webhook/post", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    publicToken,
    privateToken,
    listenerURL,
    paymentReceivedEvent: false,
    refundSentEvent: true,
    donationReceivedEvent: false,
    ecommercePaymentReceivedEvent: true,
    ecommercePaymentCancelledEvent: false,
    ecommercePaymentExpiredEvent: false,
  }),
});

const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
