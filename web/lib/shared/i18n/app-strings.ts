import type { Language } from "@ricos/shared";

type AppStrings = {
  homeTagline: string;
  homeSubtitle: string;
  add: string;
  addConfigured: string;
  remove: string;
  defaultPrep: string;
  decreaseItemAria: string;
  increaseItemAria: string;
  cartItemSingular: string;
  cartItemPlural: string;
  checkout: string;
  checkoutErrorTitle: string;
  backToMenu: string;
  preparingSecureCheckout: string;
  totalLabel: string;
  payForPickup: string;
  guestCheckoutMessage: string;
  orderSummary: string;
  processing: string;
  payCtaPrefix: string;
  paymentFailedFallback: string;
  paymentUnexpectedError: string;
  orderConfirmed: string;
  orderConfirmedMessage: string;
  paymentIntentLabel: string;
  statusLabel: string;
  orderMore: string;
  loading: string;
  languageLabel: string;
  spanishLabel: string;
  englishLabel: string;
  checkoutSelectPaymentMethod: string;
  paymentMethodStripeLabel: string;
  paymentMethodStripeDescription: string;
  paymentMethodSolanaLabel: string;
  paymentMethodAthLabel: string;
  changePaymentMethod: string;
  solanaPayStubTitle: string;
  solanaPayStubBody: string;
  athMovilStubTitle: string;
  athMovilStubBody: string;
};

const APP_STRINGS: Record<Language, AppStrings> = {
  en: {
    homeTagline: "RicoS",
    homeSubtitle: "Order online for pickup. Pay securely with your card — no account needed.",
    add: "Add to order",
    addConfigured: "Add to order",
    remove: "Remove",
    defaultPrep: "Default prep",
    decreaseItemAria: "Decrease",
    increaseItemAria: "Increase",
    cartItemSingular: "item",
    cartItemPlural: "items",
    checkout: "Checkout",
    checkoutErrorTitle: "Checkout error",
    backToMenu: "Back to menu",
    preparingSecureCheckout: "Preparing secure checkout…",
    totalLabel: "Total",
    payForPickup: "Pay for pickup",
    guestCheckoutMessage: "Guest checkout — no account required.",
    orderSummary: "Order summary",
    processing: "Processing…",
    payCtaPrefix: "Pay",
    paymentFailedFallback: "Payment failed",
    paymentUnexpectedError: "Something went wrong. Please try again.",
    orderConfirmed: "Order confirmed",
    orderConfirmedMessage:
      "Thanks for your order. We'll prepare it for pickup. Bring this confirmation if helpful for the cashier.",
    paymentIntentLabel: "Payment intent",
    statusLabel: "Status",
    orderMore: "Order more",
    loading: "Loading…",
    languageLabel: "Language",
    spanishLabel: "Spanish",
    englishLabel: "English",
    checkoutSelectPaymentMethod: "Choose how you would like to pay.",
    paymentMethodStripeLabel: "Card, bank & digital wallets",
    paymentMethodStripeDescription:
      "Credit or debit card, bank transfer, Amazon Pay, or Klarna — powered by Stripe.",
    paymentMethodSolanaLabel: "Solana Pay",
    paymentMethodAthLabel: "ATH Móvil",
    changePaymentMethod: "Change payment method",
    solanaPayStubTitle: "Solana Pay",
    solanaPayStubBody: "Solana Pay checkout will be available here soon.",
    athMovilStubTitle: "ATH Móvil",
    athMovilStubBody: "ATH Móvil checkout will be available here soon.",
  },
  es: {
    homeTagline: "RicoS",
    homeSubtitle:
      "Ordena en linea para recoger. Paga de forma segura con tu tarjeta — no necesitas cuenta.",
    add: "Agregar a la orden",
    addConfigured: "Agregar a la orden",
    remove: "Quitar",
    defaultPrep: "Preparacion por defecto",
    decreaseItemAria: "Disminuir",
    increaseItemAria: "Aumentar",
    cartItemSingular: "articulo",
    cartItemPlural: "articulos",
    checkout: "Pagar",
    checkoutErrorTitle: "Error de pago",
    backToMenu: "Volver al menu",
    preparingSecureCheckout: "Preparando pago seguro…",
    totalLabel: "Total",
    payForPickup: "Pagar para recoger",
    guestCheckoutMessage: "Pago como invitado — no requiere cuenta.",
    orderSummary: "Resumen de orden",
    processing: "Procesando…",
    payCtaPrefix: "Pagar",
    paymentFailedFallback: "El pago fallo",
    paymentUnexpectedError: "Algo salio mal. Intentalo de nuevo.",
    orderConfirmed: "Orden confirmada",
    orderConfirmedMessage:
      "Gracias por tu orden. La prepararemos para recoger. Puedes mostrar esta confirmacion en caja si hace falta.",
    paymentIntentLabel: "Intento de pago",
    statusLabel: "Estado",
    orderMore: "Ordenar mas",
    loading: "Cargando…",
    languageLabel: "Idioma",
    spanishLabel: "Español",
    englishLabel: "Inglés",
    checkoutSelectPaymentMethod: "Elige como quieres pagar.",
    paymentMethodStripeLabel: "Tarjeta, banco y billeteras digitales",
    paymentMethodStripeDescription:
      "Tarjeta de credito o debito, transferencia bancaria, Amazon Pay o Klarna — con Stripe.",
    paymentMethodSolanaLabel: "Solana Pay",
    paymentMethodAthLabel: "ATH Movil",
    changePaymentMethod: "Cambiar metodo de pago",
    solanaPayStubTitle: "Solana Pay",
    solanaPayStubBody: "El pago con Solana Pay estara disponible pronto.",
    athMovilStubTitle: "ATH Movil",
    athMovilStubBody: "El pago con ATH Movil estara disponible pronto.",
  },
};

export function getAppStrings(language: Language): AppStrings {
  return APP_STRINGS[language];
}
