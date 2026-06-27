import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { paddleEnvironment, requireEnv } from "../config";
import { PaymentMetadataSchema } from "../schemas";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentProvider,
  PaymentSubscription,
  PaymentWebhookEvent,
  PaymentWebhookEventType,
} from "./types";

interface PaddleRawEvent {
  eventId?: string;
  eventType?: string;
  data?: Record<string, unknown> | null;
}

let paddleClient: Paddle | null = null;

export function getPaddleClient(): Paddle {
  if (!paddleClient) {
    paddleClient = new Paddle(requireEnv("PADDLE_API_KEY"), {
      environment: paddleEnvironment() === "production" ? Environment.production : Environment.sandbox,
    });
  }
  return paddleClient;
}

export function setPaddleClientForTests(nextClient: Paddle | null) {
  paddleClient = nextClient;
}

function normalizeType(type: string): PaymentWebhookEventType | null {
  if (type === "transaction.paid" || type === "transaction.completed") return "payment_succeeded";
  if (type === "transaction.payment_failed" || type === "transaction.canceled") return "payment_failed";
  if (type === "adjustment.created" || type === "adjustment.updated") return "refund_succeeded";
  if (type.includes("dispute")) return "dispute_opened";
  if (type === "subscription.canceled" || type === "subscription.paused") return "subscription_cancelled";
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizePaddleWebhookEvent(event: PaddleRawEvent): PaymentWebhookEvent | null {
  const eventType = event.eventType || "";
  const type = normalizeType(eventType);
  if (!type) return null;
  const data = asRecord(event.data);
  const details = asRecord(data.details);
  const totals = asRecord(details.totals);
  const metadata = PaymentMetadataSchema.safeParse(data.customData || data.custom_data || {});
  return {
    provider: "paddle",
    eventId: event.eventId || [eventType, stringValue(data.id) || "unknown"].join(":"),
    type,
    metadata: metadata.success ? metadata.data : null,
    paymentId: stringValue(data.id),
    checkoutSessionId: stringValue(data.id),
    customerId: stringValue(data.customerId) || stringValue(data.customer_id),
    subscriptionId: stringValue(data.subscriptionId) || stringValue(data.subscription_id),
    amountCents: numberValue(totals.total),
    currency: stringValue(data.currencyCode) || stringValue(data.currency_code),
  };
}

export class PaddlePaymentProvider implements PaymentProvider {
  id = "paddle" as const;

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const transaction = await getPaddleClient().transactions.create({
      items: [{ priceId: input.purchase.providerPriceId, quantity: 1 }],
      customData: input.metadata,
      collectionMode: "automatic",
      checkout: {},
    });
    return {
      checkoutUrl: transaction.checkout?.url || "",
      checkoutSessionId: transaction.id,
      paymentId: transaction.id,
      customerId: transaction.customerId || null,
      subscriptionId: transaction.subscriptionId || null,
    };
  }

  async verifyWebhook(request: Request): Promise<PaymentWebhookEvent> {
    const body = await request.text();
    const signature = request.headers.get("Paddle-Signature") || request.headers.get("paddle-signature") || "";
    const event = (await getPaddleClient().webhooks.unmarshal(
      body,
      requireEnv("PADDLE_WEBHOOK_SECRET"),
      signature
    )) as unknown as PaddleRawEvent;
    const normalized = normalizePaddleWebhookEvent(event);
    if (!normalized) throw new Error(`Unsupported Paddle webhook type: ${event.eventType || "unknown"}`);
    return normalized;
  }

  async getSubscription(subscriptionId: string): Promise<PaymentSubscription | null> {
    const subscription = await getPaddleClient().subscriptions.get(subscriptionId);
    return {
      provider: this.id,
      id: subscription.id,
      status: subscription.status,
      customerId: subscription.customerId,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await getPaddleClient().subscriptions.cancel(subscriptionId, { effectiveFrom: "next_billing_period" });
  }
}
