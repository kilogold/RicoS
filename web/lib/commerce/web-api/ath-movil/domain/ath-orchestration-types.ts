export const ATH_ECOMMERCE_STATUS = {
  OPEN: "OPEN",
  CONFIRM: "CONFIRM",
  COMPLETED: "COMPLETED",
  CANCEL: "CANCEL",
} as const;

export type AthEcommerceStatus =
  (typeof ATH_ECOMMERCE_STATUS)[keyof typeof ATH_ECOMMERCE_STATUS];

export type AthPaymentItem = {
  name: string;
  description: string;
  quantity: number;
  price: number;
  tax: number;
  metadata: string | null;
};

export type AthCreatePaymentRequest = {
  env: "production" | "staging";
  publicToken: string;
  timeout: number;
  total: number;
  subtotal: number;
  tax: number;
  metadata1: string;
  metadata2: string;
  phoneNumber: string;
  customerName: string;
  customerEmail: string;
  items: AthPaymentItem[];
};

export type AthCreatePaymentResponse = {
  ecommerceId: string;
  authToken: string;
};

export type AthFindPaymentResponse = {
  ecommerceId: string;
  ecommerceStatus: AthEcommerceStatus;
  referenceNumber?: string;
  metadata1?: string;
  totalCents?: number;
};

export type AthAuthorizationResponse = {
  ecommerceId: string;
  ecommerceStatus: AthEcommerceStatus;
  referenceNumber?: string;
  metadata1?: string;
  totalCents?: number;
};
