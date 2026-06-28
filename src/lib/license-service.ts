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
  is_pro_user: boolean;
  access_expires_at?: string | null;
  payment_provider?: string | null;
  payment_customer_id?: string | null;
  payment_checkout_session_id?: string | null;
  payment_subscription_id?: string | null;
  payment_id?: string | null;
  last_payment_status?: string | null;
  last_payment_amount_cents?: number | null;
  last_payment_currency?: string | null;
  last_payment_access_days?: number | null;
  last_payment_at?: string | null;
  last_payment_event_id?: string | null;
  last_subscription_status?: string | null;
  last_booking_usage_key?: string | null;
  last_booking_recorded_at?: string | null;
  license_checked_at?: string | null;
}

export interface LicenseResponse {
  allowed: boolean;
  isProUser: boolean;
  checkoutUrl: string;
  message: string;
  syncIntervalMs: number;
  accessExpiresAt?: string | null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isFutureTimestamp(value: string | null | undefined, reference = new Date()): boolean {
  if (!value) return false;
  const expiresAt = new Date(value);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > reference.getTime();
}

function hasTimedAccess(user: ExtensionUser): boolean {
  return isFutureTimestamp(user.access_expires_at);
}

function hasUnlimitedAccess(user: ExtensionUser): boolean {
  return user.is_pro_user === true || hasTimedAccess(user);
}

function isAllowed(user: ExtensionUser): boolean {
  return user.status === "active" && hasUnlimitedAccess(user);
}

function responseFor(user: ExtensionUser, message: string, checkoutUrl = ""): LicenseResponse {
  return {
    allowed: isAllowed(user),
    isProUser: hasUnlimitedAccess(user),
    checkoutUrl,
    message,
    syncIntervalMs: licenseSyncIntervalMs(),
    accessExpiresAt: user.access_expires_at || null,
  };
}

function denied(message: string): LicenseResponse {
  return {
    allowed: false,
    isProUser: false,
    checkoutUrl: "",
    message,
    syncIntervalMs: licenseSyncIntervalMs(),
  };
}

function paymentMessage(user: ExtensionUser): string {
  if (user.status !== "active") return "User is disabled.";
  if (user.is_pro_user) return "Unlimited access active.";
  if (hasTimedAccess(user)) return `30-day access active until ${new Date(user.access_expires_at || "").toISOString()}.`;
  return "No active paid access. Buy access to activate bookings.";
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
  emailId: string,
  amazonEmailId: string,
  paymentProviderId: PaymentProviderId,
  supabase = getSupabaseAdmin()
): Promise<ExtensionUser> {
  const { data, error } = await table(supabase)
    .upsert(
      {
        product_id: product.productId,
        country: product.country,
        email_id: normalizeEmail(emailId),
        amazon_email_id: normalizeEmail(amazonEmailId),
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
  const emailId = request.emailId ? normalizeEmail(request.emailId) : "";
  const amazonEmailId = request.amazonEmailId ? normalizeEmail(request.amazonEmailId) : "";
  const user = emailId && amazonEmailId
    ? await upsertCheckoutUser(product, emailId, amazonEmailId, provider.id)
    : null;
  const metadata: PaymentMetadata = {
    product_id: product.productId,
    country: product.country,
    ...(emailId ? { email_id: emailId } : {}),
    ...(amazonEmailId ? { amazon_email_id: amazonEmailId } : {}),
    purchase_type: purchase.purchaseType,
  };
  const session = await provider.createCheckout({
    product,
    purchase,
    emailId,
    amazonEmailId,
    metadata,
  });
  if (user) {
    const updated = await updateUser(user.id, {
      payment_provider: provider.id,
      payment_checkout_session_id: session.checkoutSessionId,
      payment_id: session.paymentId || null,
      payment_customer_id: session.customerId || user.payment_customer_id || null,
      payment_subscription_id: session.subscriptionId || user.payment_subscription_id || null,
    });
    return responseFor(updated, "Open checkout to buy access.", session.checkoutUrl || "");
  }
  return {
    allowed: false,
    isProUser: false,
    checkoutUrl: session.checkoutUrl || "",
    message: "Open checkout to buy access.",
    syncIntervalMs: licenseSyncIntervalMs(),
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + Math.max(0, days));
  return next;
}

function extendedAccessExpiry(user: ExtensionUser, accessDays: number): string | null {
  if (accessDays <= 0) return user.access_expires_at || null;
  const now = new Date();
  const currentExpiry = user.access_expires_at ? new Date(user.access_expires_at) : null;
  const base = currentExpiry && Number.isFinite(currentExpiry.getTime()) && currentExpiry > now ? currentExpiry : now;
  return addDays(base, accessDays).toISOString();
}

export async function recordUsage(productId: string, request: UsageRequest): Promise<LicenseResponse> {
  requireProduct(productId);
  const amazonEmail = normalizeEmail(request.amazonEmailId);
  const user = await findUser(productId, amazonEmail);
  if (!user) return denied("Amazon email is not registered for this extension.");
  if (user.status !== "active") return responseFor(user, "User is disabled.");
  if (user.last_booking_usage_key === request.idempotencyKey) {
    return responseFor(user, "Booking was already recorded for this access period.");
  }
  if (hasUnlimitedAccess(user)) {
    const updated = await updateUser(user.id, {
      last_booking_usage_key: request.idempotencyKey,
      last_booking_recorded_at: new Date().toISOString(),
    });
    return responseFor(updated, "Booking recorded for paid access.");
  }
  return responseFor(user, "No active paid access. Buy access to continue booking.");
}

async function userForMetadata(metadata: PaymentMetadata): Promise<ExtensionUser | null> {
  if (!metadata.amazon_email_id) return null;
  return findUser(metadata.product_id, metadata.amazon_email_id);
}

function emailsForPayment(event: PaymentWebhookEvent, metadata: PaymentMetadata): { emailId: string; amazonEmailId: string } | null {
  const emailId = normalizeEmail(metadata.email_id || event.customerEmail || metadata.amazon_email_id || "");
  const amazonEmailId = normalizeEmail(metadata.amazon_email_id || event.customerEmail || metadata.email_id || "");
  return emailId && amazonEmailId ? { emailId, amazonEmailId } : null;
}

async function ensurePaidUser(
  product: ProductConfig,
  metadata: PaymentMetadata,
  event: PaymentWebhookEvent
): Promise<ExtensionUser | null> {
  const emails = emailsForPayment(event, metadata);
  if (!emails) return null;
  const existing = await findUser(product.productId, emails.amazonEmailId);
  if (existing) {
    if (existing.email_id !== emails.emailId) {
      return updateUser(existing.id, { email_id: emails.emailId });
    }
    return existing;
  }
  return upsertCheckoutUser(product, emails.emailId, emails.amazonEmailId, event.provider);
}

async function processPaymentSucceeded(event: PaymentWebhookEvent, metadata: PaymentMetadata): Promise<LicenseResponse> {
  const product = requireProduct(metadata.product_id);
  const purchase = purchaseConfig(product, metadata.purchase_type, event.provider);
  const user = await ensurePaidUser(product, metadata, event);
  if (!user) return denied("Payment webhook is missing the customer or Amazon job-search email.");
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
    last_payment_access_days: purchase.accessDays,
    last_payment_at: new Date().toISOString(),
    last_payment_event_id: event.eventId,
    status: "active",
    access_expires_at: extendedAccessExpiry(user, purchase.accessDays),
  };
  if (purchase.isPro) {
    updates.last_subscription_status = event.subscriptionId ? "active" : user.last_subscription_status || null;
  }
  const updated = await updateUser(user.id, updates);
  return responseFor(updated, `${purchase.accessDays} days access added.`);
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
