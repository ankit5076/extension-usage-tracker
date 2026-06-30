import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { appUrl, razorpayCurrency, requireEnv } from "../config";
import { PaymentMetadataSchema } from "../schemas";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentProvider,
  PaymentSubscription,
  PaymentWebhookEvent,
  PaymentWebhookEventType,
} from "./types";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

interface RazorpayPaymentLink {
  id?: string;
  short_url?: string;
  amount?: number;
  amount_paid?: number;
  currency?: string;
  status?: string;
  customer?: {
    email?: string | null;
    name?: string | null;
  } | null;
  notes?: Record<string, unknown> | null;
}

interface RazorpayPayment {
  id?: string;
  amount?: number;
  currency?: string;
  email?: string | null;
  customer_id?: string | null;
  notes?: Record<string, unknown> | null;
}

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment_link?: { entity?: RazorpayPaymentLink | null } | null;
    payment?: { entity?: RazorpayPayment | null } | null;
  } | null;
  created_at?: number;
}

type FetchLike = typeof fetch;

let razorpayFetch: FetchLike = fetch;

export function setRazorpayFetchForTests(nextFetch: FetchLike | null) {
  razorpayFetch = nextFetch || fetch;
}

function checkoutReturnUrl(): string {
  return `${appUrl()}/checkout/success`;
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${requireEnv("RAZORPAY_KEY_ID")}:${requireEnv("RAZORPAY_KEY_SECRET")}`).toString("base64")}`;
}

function metadataNotes(input: CreateCheckoutInput): Record<string, string> {
  return Object.fromEntries(Object.entries(input.metadata).map(([key, value]) => [key, String(value)]));
}

function referenceId(input: CreateCheckoutInput): string {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  return [input.product.country, input.purchase.purchaseType, suffix].join("-");
}

function paymentLinkDescription(input: CreateCheckoutInput): string {
  const plan = input.purchase.purchaseType === "pro" ? "annual pro access" : "30-day access";
  return `${input.product.extensionName} ${plan}`;
}

function normalizeType(type: string): PaymentWebhookEventType | null {
  if (type === "payment_link.paid" || type === "payment.captured") {
    return "payment_succeeded";
  }
  if (
    type === "payment_link.cancelled" ||
    type === "payment_link.expired" ||
    type === "payment.failed" ||
    type === "payment_link.partially_paid"
  ) {
    return "payment_failed";
  }
  if (type === "refund.processed" || type === "refund.created") return "refund_succeeded";
  if (type.includes("dispute")) return "dispute_opened";
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function notesFor(paymentLink?: RazorpayPaymentLink | null, payment?: RazorpayPayment | null): Record<string, unknown> {
  return paymentLink?.notes || payment?.notes || {};
}

export function normalizeRazorpayWebhookEvent(
  event: RazorpayWebhookPayload,
  eventIdFromHeader = ""
): PaymentWebhookEvent | null {
  const eventType = event.event || "";
  const type = normalizeType(eventType);
  if (!type) return null;

  const paymentLink = event.payload?.payment_link?.entity || null;
  const payment = event.payload?.payment?.entity || null;
  const metadata = PaymentMetadataSchema.safeParse(notesFor(paymentLink, payment));
  const paymentId = stringValue(payment?.id);
  const paymentLinkId = stringValue(paymentLink?.id);

  return {
    provider: "razorpay",
    eventId: eventIdFromHeader || [eventType, paymentId || paymentLinkId || event.created_at || "unknown"].join(":"),
    type,
    metadata: metadata.success ? metadata.data : null,
    paymentId,
    checkoutSessionId: paymentLinkId,
    customerId: stringValue(payment?.customer_id),
    customerEmail: stringValue(payment?.email) || stringValue(paymentLink?.customer?.email),
    subscriptionId: null,
    amountCents: numberValue(payment?.amount) ?? numberValue(paymentLink?.amount_paid) ?? numberValue(paymentLink?.amount),
    currency: stringValue(payment?.currency) || stringValue(paymentLink?.currency),
  };
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(signature.trim());
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export class RazorpayPaymentProvider implements PaymentProvider {
  id = "razorpay" as const;

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const amount = Number.parseInt(input.purchase.providerPriceId, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Razorpay amount is not configured for ${input.product.productId} ${input.purchase.purchaseType}`);
    }

    const body: Record<string, unknown> = {
      amount,
      currency: razorpayCurrency(),
      accept_partial: false,
      reference_id: referenceId(input),
      description: paymentLinkDescription(input),
      callback_url: checkoutReturnUrl(),
      callback_method: "get",
      notes: metadataNotes(input),
    };
    if (input.emailId) {
      body.customer = {
        email: input.emailId,
        name: input.emailId,
      };
      body.notify = { email: true, sms: false };
    }

    const response = await razorpayFetch(`${RAZORPAY_API_BASE}/payment_links`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as RazorpayPaymentLink & { error?: { description?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.description || `Razorpay Payment Link request failed with HTTP ${response.status}`);
    }
    if (!payload.id || !payload.short_url) {
      throw new Error("Razorpay Payment Link response did not include a checkout URL");
    }
    return {
      checkoutUrl: payload.short_url,
      checkoutSessionId: payload.id,
      paymentId: null,
      customerId: null,
      subscriptionId: null,
    };
  }

  async verifyWebhook(request: Request): Promise<PaymentWebhookEvent> {
    const body = await request.text();
    const signature = request.headers.get("X-Razorpay-Signature") || request.headers.get("x-razorpay-signature") || "";
    if (!verifySignature(body, signature, requireEnv("RAZORPAY_WEBHOOK_SECRET"))) {
      throw new Error("Invalid Razorpay webhook signature");
    }
    const event = JSON.parse(body) as RazorpayWebhookPayload;
    const normalized = normalizeRazorpayWebhookEvent(
      event,
      request.headers.get("x-razorpay-event-id") || request.headers.get("X-Razorpay-Event-Id") || ""
    );
    if (!normalized) throw new Error(`Unsupported Razorpay webhook type: ${event.event || "unknown"}`);
    return normalized;
  }

  async getSubscription(_subscriptionId: string): Promise<PaymentSubscription | null> {
    return null;
  }

  async cancelSubscription(_subscriptionId: string): Promise<void> {
    throw new Error("Razorpay Payment Links do not support subscription cancellation");
  }
}
