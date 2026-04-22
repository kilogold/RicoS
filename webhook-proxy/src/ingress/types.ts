export type IngressProvider = "stripe" | "helius";

export type NormalizedIngressEvent = {
  provider: IngressProvider;
  ingressEventId: string;
  paymentReferenceId: string;
  amountCents: number;
  currency: string;
  metadata: Record<string, string | undefined>;
};
