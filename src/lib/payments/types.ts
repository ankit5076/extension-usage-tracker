import type { ProductConfig, PurchaseConfig } from "../products";
import type { PaymentMetadata } from "../schemas";

export type PaymentProviderId = "dodo" | "paddle";

export interface CreateCheckoutInput {
  product: ProductConfig;
  purchase: PurchaseConfig;
  emailId?: string;
  amazonEmailId?: string;
  metadata: PaymentMetadata;
}

export interface CreateCheckoutResult {
  checkoutUrl: string;
  checkoutSessionId: string;
  paymentId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}

export type PaymentWebhookEventType =
  | "payment_succeeded"
  | "payment_failed"
  | "refund_succeeded"
  | "dispute_opened"
  | "subscription_cancelled";

export interface PaymentWebhookEvent {
  provider: PaymentProviderId;
  eventId: string;
  type: PaymentWebhookEventType;
  metadata: PaymentMetadata | null;
  paymentId?: string | null;
  checkoutSessionId?: string | null;
  customerId?: string | null;
  customerEmail?: string | null;
  subscriptionId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
}

export interface PaymentSubscription {
  provider: PaymentProviderId;
  id: string;
  status: string;
  customerId?: string | null;
}

export interface PaymentProvider {
  id: PaymentProviderId;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  verifyWebhook(request: Request): Promise<PaymentWebhookEvent>;
  getSubscription(subscriptionId: string): Promise<PaymentSubscription | null>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}
