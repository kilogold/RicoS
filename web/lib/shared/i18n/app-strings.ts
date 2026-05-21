import type { Language } from "@ricos/shared";

export type AppStrings = {
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
  subtotalLabel: string;
  serviceChargeLabel: string;
  salesTaxLabel: string;
  municipalTaxLabel: string;
  grandTotalLabel: string;
  payForPickup: string;
  guestCheckoutMessage: string;
  orderSummary: string;
  processing: string;
  payCtaPrefix: string;
  paymentFailedFallback: string;
  paymentUnexpectedError: string;
  orderConfirmed: string;
  orderConfirmedMessage: string;
  orderConfirmationVerifying: string;
  orderConfirmationErrorTitle: string;
  orderConfirmationMissingOrder: string;
  orderConfirmationNotConfirmed: string;
  orderConfirmationPaymentFailed: string;
  orderConfirmationInvalidSession: string;
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
  serviceModeHeading: string;
  takeoutLabel: string;
  takeoutDescription: string;
  dineInLabel: string;
  dineInDescription: string;
  dineInUnavailableDuringLastCall: string;
  continueToContact: string;
  editServiceMode: string;
  solanaPayStubTitle: string;
  solanaPayStubBody: string;
  athMovilStubTitle: string;
  athMovilStubBody: string;
  pickupContactHeading: string;
  customerNameLabel: string;
  customerPhoneLabel: string;
  customerEmailLabel: string;
  customerEmailOptionalHint: string;
  checkoutContactIncomplete: string;
  continueToPayment: string;
  editContact: string;
  checkoutPhaseServiceIntro: string;
  checkoutPhaseContactIntro: string;
  checkoutPhasePaymentIntro: string;
  storeClosedBanner: string;
  lastCallBannerPrefix: string;
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
    subtotalLabel: "Subtotal",
    serviceChargeLabel: "Service charge",
    salesTaxLabel: "Sales tax",
    municipalTaxLabel: "Municipal tax",
    grandTotalLabel: "Total",
    payForPickup: "Checkout",
    guestCheckoutMessage: "Guest checkout — no account required.",
    orderSummary: "Order summary",
    processing: "Processing…",
    payCtaPrefix: "Pay",
    paymentFailedFallback: "Payment failed",
    paymentUnexpectedError: "Something went wrong. Please try again.",
    orderConfirmed: "Order confirmed",
    orderConfirmedMessage:
      "Thanks for your order. We'll start preparing it. Bring this confirmation if helpful for the cashier.",
    orderConfirmationVerifying: "Verifying your order…",
    orderConfirmationErrorTitle: "There is a problem with your order",
    orderConfirmationMissingOrder:
      "We could not find your order in our system. If you were charged, contact the store with your payment reference below — do not assume your order was placed.",
    orderConfirmationNotConfirmed:
      "Your payment may have gone through, but we have not confirmed your order yet. Please contact the store with the payment reference below.",
    orderConfirmationPaymentFailed:
      "Your payment did not complete. You have not been charged for a confirmed order. Please return to checkout and try again.",
    orderConfirmationInvalidSession:
      "This confirmation link is incomplete or invalid. Please return to the menu and start checkout again.",
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
    serviceModeHeading: "How will you receive your order?",
    takeoutLabel: "Takeout",
    takeoutDescription: "Pick up your order at the counter.",
    dineInLabel: "Dine-in",
    dineInDescription: "Eat your order here.",
    dineInUnavailableDuringLastCall: "Dine-in is unavailable during last call. Takeout is still available.",
    continueToContact: "Continue to contact info",
    editServiceMode: "Edit order type",
    solanaPayStubTitle: "Solana Pay",
    solanaPayStubBody: "Solana Pay checkout will be available here soon.",
    athMovilStubTitle: "ATH Móvil",
    athMovilStubBody: "ATH Móvil checkout will be available here soon.",
    pickupContactHeading: "Contact info",
    customerNameLabel: "Name",
    customerPhoneLabel: "Phone",
    customerEmailLabel: "Email",
    customerEmailOptionalHint: "optional",
    checkoutContactIncomplete: "Enter your name and phone to continue.",
    continueToPayment: "Continue to payment",
    editContact: "Edit contact",
    checkoutPhaseServiceIntro: "Step 1 of 4 - choose takeout or dine-in.",
    checkoutPhaseContactIntro: "Step 2 of 4 - enter your contact info.",
    checkoutPhasePaymentIntro: "Step 3 of 4 - pay securely. Confirmation appears after payment completes.",
    storeClosedBanner:
      "We're closed — you can browse the menu. Online ordering opens at 8:00 AM and closes at 9:00 PM (store time).",
    lastCallBannerPrefix: "Last call — ordering closes in",
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
    subtotalLabel: "Subtotal",
    serviceChargeLabel: "Cargo por servicio",
    salesTaxLabel: "IVU",
    municipalTaxLabel: "Impuesto municipal",
    grandTotalLabel: "Total",
    payForPickup: "Pagar",
    guestCheckoutMessage: "Pago como invitado — no requiere cuenta.",
    orderSummary: "Resumen de orden",
    processing: "Procesando…",
    payCtaPrefix: "Pagar",
    paymentFailedFallback: "El pago fallo",
    paymentUnexpectedError: "Algo salio mal. Intentalo de nuevo.",
    orderConfirmed: "Orden confirmada",
    orderConfirmedMessage:
      "Gracias por tu orden. Empezaremos a prepararla. Puedes mostrar esta confirmacion en caja si hace falta.",
    orderConfirmationVerifying: "Verificando tu orden…",
    orderConfirmationErrorTitle: "Hay un problema con tu orden",
    orderConfirmationMissingOrder:
      "No encontramos tu orden en el sistema. Si se te cobro, contacta la tienda con la referencia de pago abajo — no asumas que tu orden fue registrada.",
    orderConfirmationNotConfirmed:
      "Es posible que el pago se haya procesado, pero aun no confirmamos tu orden. Contacta la tienda con la referencia de pago abajo.",
    orderConfirmationPaymentFailed:
      "El pago no se completo. No se registro una orden confirmada. Vuelve al pago e intentalo de nuevo.",
    orderConfirmationInvalidSession:
      "Este enlace de confirmacion esta incompleto o no es valido. Vuelve al menu e inicia el pago de nuevo.",
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
    serviceModeHeading: "Como recibiras tu orden?",
    takeoutLabel: "Takeout",
    takeoutDescription: "Recoge tu orden en el mostrador.",
    dineInLabel: "Dine-in",
    dineInDescription: "Come tu orden en el local.",
    dineInUnavailableDuringLastCall: "Comer aqui no esta disponible durante ultima hora. Para llevar sigue disponible.",
    continueToContact: "Continuar a contacto",
    editServiceMode: "Editar tipo de orden",
    solanaPayStubTitle: "Solana Pay",
    solanaPayStubBody: "El pago con Solana Pay estara disponible pronto.",
    athMovilStubTitle: "ATH Movil",
    athMovilStubBody: "El pago con ATH Movil estara disponible pronto.",
    pickupContactHeading: "Informacion de contacto",
    customerNameLabel: "Nombre",
    customerPhoneLabel: "Telefono",
    customerEmailLabel: "Correo",
    customerEmailOptionalHint: "opcional",
    checkoutContactIncomplete: "Ingresa nombre y telefono para continuar.",
    continueToPayment: "Continuar al pago",
    editContact: "Editar contacto",
    checkoutPhaseServiceIntro: "Paso 1 de 4 - elige para llevar o comer aqui.",
    checkoutPhaseContactIntro: "Paso 2 de 4 - ingresa tu informacion de contacto.",
    checkoutPhasePaymentIntro:
      "Paso 3 de 4 - paga con seguridad. Veras la confirmacion al completar el pago.",
    storeClosedBanner:
      "Estamos cerrados — puedes ver el menu. Las ordenes en linea abren a las 8:00 a. m. y cierran a las 9:00 p. m. (hora local).",
    lastCallBannerPrefix: "Ultima hora — el pedido en linea cierra en",
  },
};

export function getAppStrings(language: Language): AppStrings {
  return APP_STRINGS[language];
}
