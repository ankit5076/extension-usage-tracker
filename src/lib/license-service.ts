import type { SupabaseClient } from "@supabase/supabase-js";
import { extensionSupabaseSchema, extensionUsersTable, licenseSyncIntervalMs } from "./config";
import { requireProduct, purchaseConfig, type ProductConfig, type ProductId, type PurchaseType } from "./products";
import { defaultPaymentProvider } from "./payments/registry";
import type { PaymentProviderId, PaymentWebhookEvent } from "./payments/types";
import type { CheckoutRequest, PaymentMetadata, UsageRequest } from "./schemas";
import { getSupabaseAdmin } from "./supabase-admin";

export interface ExtensionUser {
  id: string;
  product_id: ProductId;
  country: string;
  email_id: string;
  amazon_email_id: string;
  status: "active" | "disabled" | "refunded" | "blocked";
  credits_available: number;
  is_pro_user: boolean;
  payment_provider?: string | null;
  payment_customer_id?: string | null;
  payment_checkout_session_id?: string | null;
  payment_subscription_id?: string | null;
  payment_id?: string | null;
  last_payment_status?: string | null;
  last_payment_amount_cents?: number | null;
  last_payment_currency?: string | null;
  last_payment_credits?: number | null;
  last_payment_at?: string | null;
  last_payment_event_id?: string | null;
  last_subscription_status?: string | null;
  last_booking_deduction_key?: string | null;
  last_credit_deducted_at?: string | null;
  license_checked_at?: string | null;
}

export interface LicenseResponse {
  allowed: boolean;
  credits: number;
  isProUser: boolean;
  checkoutUrl: string;
  message: string;
  syncIntervalMs: number;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function safeCredits(user: Pick<ExtensionUser, "credits_available"> | null | undefined): number {
  return Math.max(0, Number(user?.credits_available || 0));
}

function isAllowed(user: ExtensionUser): boolean {
  return user.status === "active" && (user.is_pro_user || safeCredits(user) > 0);
}

function responseFor(user: ExtensionUser, message: string, checkoutUrl = ""): LicenseResponse {
  return {
    allowed: isAllowed(user),
    credits: safeCredits(user),
    isProUser: user.is_pro_user === true,
    checkoutUrl,
    message,
    syncIntervalMs: licenseSyncIntervalMs(),
  };
}

function denied(message: string): LicenseResponse {
  return {
    allowed: false,
    credits: 0,
    isProUser: false,
    checkoutUrl: "",
    message,
    syncIntervalMs: licenseSyncIntervalMs(),
  };
}

function paymentMessage(user: ExtensionUser): string {
  if (user.status !== "active") return "User is disabled.";
  if (user.is_pro_user) return "Unlimited access active.";
  const credits = safeCredits(user);
  if (credits > 0) return `${credits} booking credit${credits === 1 ? "" : "s"} available.`;
  return "No active credits. Buy credits to activate.";
}

function assertSupabase<T>(data: T, error: { message?: string } | null): T {
  if (error) throw new Error(error.message || "Supabase request failed");
  return data;
}

function table(supabase: SupabaseClient) {
  return supabase.schema(extensionSupabaseSchema()).from(extensionUsersTable());
}

export async function findUser(
  productId: string,
  amazonEmail: string,
  supabase = getSupabaseAdmin()
): Promise<ExtensionUser | null> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("product_id", productId)
    .eq("amazon_email_id", normalizeEmail(amazonEmail))
    .limit(1)
    .maybeSingle();
  return assertSupabase(data as ExtensionUser | null, error);
}

async function updateUser(
  userId: string,
  values: Record<string, unknown>,
  supabase = getSupabaseAdmin()
): Promise<ExtensionUser> {
  const { data, error } = await table(supabase)
    .update(values)
    .eq("id", userId)
    .select("*")
    .single();
  return assertSupabase(data as ExtensionUser, error);
}

export async function checkLicense(productId: string, amazonEmail: string): Promise<LicenseResponse> {
  requireProduct(productId);
  const user = await findUser(productId, amazonEmail);
  if (!user) return denied("Amazon email is not registered for this extension.");
  const updated = await updateUser(user.id, { license_checked_at: new Date().toISOString() });
  return responseFor(updated, paymentMessage(updated));
}

async function upsertCheckoutUser(
  product: ProductConfig,
  request: CheckoutRequest,
  paymentProviderId: PaymentProviderId,
  supabase = getSupabaseAdmin()
): Promise<ExtensionUser> {
  const { data, error } = await table(supabase)
    .upsert(
      {
        product_id: product.productId,
        country: product.country,
        email_id: normalizeEmail(request.emailId),
        amazon_email_id: normalizeEmail(request.amazonEmailId),
        status: "active",
        payment_provider: paymentProviderId,
      },
      { onConflict: "product_id,amazon_email_id" }
    )
    .select("*")
    .single();
  return assertSupabase(data as ExtensionUser, error);
}

export async function createCheckout(productId: string, request: CheckoutRequest): Promise<LicenseResponse> {
  const product = requireProduct(productId);
  const provider = defaultPaymentProvider();
  const purchase = purchaseConfig(product, request.purchaseType as PurchaseType, provider.id);
  const user = await upsertCheckoutUser(product, request, provider.id);
  const metadata: PaymentMetadata = {
    product_id: product.productId,
    country: product.country,
    email_id: normalizeEmail(request.emailId),
    amazon_email_id: normalizeEmail(request.amazonEmailId),
    purchase_type: purchase.purchaseType,
  };
  const session = await provider.createCheckout({
    product,
    purchase,
    emailId: metadata.email_id,
    amazonEmailId: metadata.amazon_email_id,
    metadata,
  });
  const updated = await updateUser(user.id, {
    payment_provider: provider.id,
    payment_checkout_session_id: session.checkoutSessionId,
    payment_id: session.paymentId || null,
    payment_customer_id: session.customerId || user.payment_customer_id || null,
    payment_subscription_id: session.subscriptionId || user.payment_subscription_id || null,
  });
  return responseFor(updated, "Open checkout to buy credits.", session.checkoutUrl || "");
}

export async function recordUsage(productId: string, request: UsageRequest): Promise<LicenseResponse> {
  requireProduct(productId);
  const amazonEmail = normalizeEmail(request.amazonEmailId);
  const user = await findUser(productId, amazonEmail);
  if (!user) return denied("Amazon email is not registered for this extension.");
  if (user.status !== "active") return responseFor(user, "User is disabled.");
  if (user.last_booking_deduction_key === request.idempotencyKey) {
    return responseFor(user, "Booking credit was already deducted for this booking.");
  }
  if (user.is_pro_user) {
    const updated = await updateUser(user.id, {
      last_booking_deduction_key: request.idempotencyKey,
      last_credit_deducted_at: new Date().toISOString(),
    });
    return responseFor(updated, "Pro user booking recorded.");
  }
  if (safeCredits(user) <= 0) return responseFor(user, "No booking credits available.");

  const { data, error } = await table(getSupabaseAdmin())
    .update({
      credits_available: safeCredits(user) - 1,
      last_booking_deduction_key: request.idempotencyKey,
      last_credit_deducted_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .eq("credits_available", safeCredits(user))
    .select("*")
    .maybeSingle();
  assertSupabase(data, error);
  if (!data) {
    const refreshed = await findUser(productId, amazonEmail);
    if (refreshed?.last_booking_deduction_key === request.idempotencyKey) {
      return responseFor(refreshed, "Booking credit was already deducted for this booking.");
    }
    return responseFor(user, "Unable to deduct booking credit. Please retry.");
  }
  return responseFor(data as ExtensionUser, "Booking credit deducted.");
}

async function userForMetadata(metadata: PaymentMetadata): Promise<ExtensionUser | null> {
  return findUser(metadata.product_id, metadata.amazon_email_id);
}

async function processPaymentSucceeded(event: PaymentWebhookEvent, metadata: PaymentMetadata): Promise<LicenseResponse> {
  const product = requireProduct(metadata.product_id);
  const purchase = purchaseConfig(product, metadata.purchase_type, event.provider);
  const user = await userForMetadata(metadata);
  if (!user) return denied("Amazon email is not registered for this extension.");
  if (user.last_payment_event_id === event.eventId) {
    return responseFor(user, "Payment event already processed.");
  }
  const updates: Record<string, unknown> = {
    payment_provider: event.provider,
    payment_customer_id: event.customerId || user.payment_customer_id || null,
    payment_checkout_session_id: event.checkoutSessionId || user.payment_checkout_session_id || null,
    payment_subscription_id: event.subscriptionId || user.payment_subscription_id || null,
    payment_id: event.paymentId || user.payment_id || null,
    last_payment_status: "succeeded",
    last_payment_amount_cents: event.amountCents ?? null,
    last_payment_currency: event.currency || null,
    last_payment_credits: purchase.credits,
    last_payment_at: new Date().toISOString(),
    last_payment_event_id: event.eventId,
    status: "active",
  };
  if (purchase.isPro) {
    updates.is_pro_user = true;
  } else {
    updates.credits_available = safeCredits(user) + purchase.credits;
  }
  const updated = await updateUser(user.id, updates);
  return responseFor(updated, purchase.isPro ? "Pro access activated." : `${purchase.credits} credits added.`);
}

async function processRefundDisputeOrCancellation(event: PaymentWebhookEvent, metadata: PaymentMetadata): Promise<LicenseResponse> {
  const user = await userForMetadata(metadata);
  if (!user) return denied("Amazon email is not registered for this extension.");
  if (user.last_payment_event_id === event.eventId) {
    return responseFor(user, "Payment event already processed.");
  }
  const status =
    event.type === "refund_succeeded"
      ? "refunded"
      : event.type === "dispute_opened"
        ? "blocked"
        : "disabled";
  const updated = await updateUser(user.id, {
    payment_provider: event.provider,
    payment_id: event.paymentId || user.payment_id || null,
    payment_customer_id: event.customerId || user.payment_customer_id || null,
    payment_checkout_session_id: event.checkoutSessionId || user.payment_checkout_session_id || null,
    payment_subscription_id: event.subscriptionId || user.payment_subscription_id || null,
    last_payment_status: event.type,
    last_payment_event_id: event.eventId,
    last_subscription_status: event.type === "subscription_cancelled" ? "cancelled" : user.last_subscription_status || null,
    status,
  });
  return responseFor(updated, "Payment status updated.");
}

async function processPaymentFailed(event: PaymentWebhookEvent, metadata: PaymentMetadata): Promise<LicenseResponse> {
  const user = await userForMetadata(metadata);
  if (!user) return denied("Amazon email is not registered for this extension.");
  if (user.last_payment_event_id === event.eventId) {
    return responseFor(user, "Payment event already processed.");
  }
  const updated = await updateUser(user.id, {
    payment_provider: event.provider,
    payment_id: event.paymentId || user.payment_id || null,
    payment_customer_id: event.customerId || user.payment_customer_id || null,
    payment_checkout_session_id: event.checkoutSessionId || user.payment_checkout_session_id || null,
    payment_subscription_id: event.subscriptionId || user.payment_subscription_id || null,
    last_payment_status: "failed",
    last_payment_amount_cents: event.amountCents ?? null,
    last_payment_currency: event.currency || null,
    last_payment_event_id: event.eventId,
  });
  return responseFor(updated, "Payment failed.");
}

export async function processPaymentWebhookEvent(event: PaymentWebhookEvent): Promise<LicenseResponse> {
  if (!event.metadata) return denied("Payment webhook metadata is missing required extension fields.");
  if (event.type === "payment_succeeded") return processPaymentSucceeded(event, event.metadata);
  if (event.type === "payment_failed") return processPaymentFailed(event, event.metadata);
  return processRefundDisputeOrCancellation(event, event.metadata);
}
