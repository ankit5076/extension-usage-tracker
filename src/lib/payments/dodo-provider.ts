import { DodoPayments } from "dodopayments";
import type { CheckoutSessionCreateParams } from "dodopayments/resources/checkout-sessions";
import { appUrl, dodoEnvironment, requireEnv } from "../config";
import { PaymentMetadataSchema } from "../schemas";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentProvider,
  PaymentSubscription,
  PaymentWebhookEvent,
  PaymentWebhookEventType,
} from "./types";

interface DodoPaymentData {
  payment_id?: string | null;
  checkout_session_id?: string | null;
  customer_id?: string | null;
  subscription_id?: string | null;
  customer?: { customer_id?: string | null; email?: string | null } | null;
  total_amount?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface DodoRawEvent {
  type: string;
  timestamp?: string | Date;
  data?: DodoPaymentData | Record<string, unknown> | null;
}

let dodoClient: DodoPayments | null = null;

export function getDodoClient(): DodoPayments {
  if (!dodoClient) {
    dodoClient = new DodoPayments({
      bearerToken: requireEnv("DODO_PAYMENTS_API_KEY"),
      webhookKey: requireEnv("DODO_PAYMENTS_WEBHOOK_KEY"),
      environment: dodoEnvironment(),
    });
  }
  return dodoClient;
}

export function setDodoClientForTests(nextClient: DodoPayments | null) {
  dodoClient = nextClient;
}

function checkoutReturnUrl(): string {
  return `${appUrl()}/checkout/success`;
}

function normalizeType(type: string): PaymentWebhookEventType | null {
  if (type === "payment.succeeded" || type === "subscription.renewed" || type === "subscription.active") {
    return "payment_succeeded";
  }
  if (type === "payment.failed" || type === "payment.cancelled") return "payment_failed";
  if (type === "refund.succeeded") return "refund_succeeded";
  if (type === "dispute.opened" || type === "dispute.lost") return "dispute_opened";
  if (type === "subscription.cancelled" || type === "subscription.expired") return "subscription_cancelled";
  return null;
}

function dataFor(event: DodoRawEvent): DodoPaymentData {
  return (event.data || {}) as DodoPaymentData;
}

function dodoEventId(event: DodoRawEvent): string {
  const data = dataFor(event);
  return [event.type, data.payment_id || data.checkout_session_id || data.subscription_id || event.timestamp || "unknown"].join(":");
}

export function normalizeDodoWebhookEvent(event: DodoRawEvent): PaymentWebhookEvent | null {
  const type = normalizeType(event.type);
  if (!type) return null;
  const data = dataFor(event);
  const metadata = PaymentMetadataSchema.safeParse(data.metadata || {});
  return {
    provider: "dodo",
    eventId: dodoEventId(event),
    type,
    metadata: metadata.success ? metadata.data : null,
    paymentId: data.payment_id || null,
    checkoutSessionId: data.checkout_session_id || null,
    customerId: data.customer_id || data.customer?.customer_id || null,
    subscriptionId: data.subscription_id || null,
    amountCents: data.total_amount ?? null,
    currency: data.currency || null,
  };
}

export class DodoPaymentProvider implements PaymentProvider {
  id = "dodo" as const;

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const params: CheckoutSessionCreateParams = {
      product_cart: [{ product_id: input.purchase.providerPriceId, quantity: 1 }],
      customer: {
        email: input.emailId,
        name: input.emailId,
      },
      metadata: input.metadata,
      return_url: checkoutReturnUrl(),
      cancel_url: checkoutReturnUrl(),
    };
    const session = await getDodoClient().checkoutSessions.create(params);
    return {
      checkoutUrl: session.checkout_url || "",
      checkoutSessionId: session.session_id,
      paymentId: session.payment_id || null,
    };
  }

  async verifyWebhook(request: Request): Promise<PaymentWebhookEvent> {
    const body = await request.text();
    const event = getDodoClient().webhooks.unwrap(body, {
      headers: {
        "webhook-id": request.headers.get("webhook-id") || "",
        "webhook-timestamp": request.headers.get("webhook-timestamp") || "",
        "webhook-signature": request.headers.get("webhook-signature") || "",
      },
      key: requireEnv("DODO_PAYMENTS_WEBHOOK_KEY"),
    }) as DodoRawEvent;
    const normalized = normalizeDodoWebhookEvent(event);
    if (!normalized) throw new Error(`Unsupported Dodo webhook type: ${event.type}`);
    return normalized;
  }

  async getSubscription(subscriptionId: string): Promise<PaymentSubscription | null> {
    const subscription = await getDodoClient().subscriptions.retrieve(subscriptionId);
    return {
      provider: this.id,
      id: subscription.subscription_id || subscriptionId,
      status: subscription.status,
      customerId: subscription.customer?.customer_id || null,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await getDodoClient().subscriptions.update(subscriptionId, {
      cancel_at_next_billing_date: true,
      cancel_reason: "cancelled_by_merchant",
    });
  }
}
