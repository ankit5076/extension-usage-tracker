import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkLicense,
  createCheckout,
  processPaymentWebhookEvent,
  recordUsage,
  type ExtensionUser,
} from "./license-service";
import { normalizeDodoWebhookEvent, setDodoClientForTests } from "./payments/dodo-provider";
import { normalizePaddleWebhookEvent, setPaddleClientForTests } from "./payments/paddle-provider";
import { defaultPaymentProvider, resetPaymentProvidersForTests, setPaymentProviderForTests } from "./payments/registry";
import type { PaymentProvider } from "./payments/types";
import { setSupabaseAdminForTests } from "./supabase-admin";

type Row = ExtensionUser;

class Query {
  private filters: Array<[string, unknown]> = [];
  private updateValues: Record<string, unknown> | null = null;
  private upsertValues: Record<string, unknown> | null = null;

  constructor(private rows: Row[]) {}

  select() {
    return this;
  }

  limit() {
    return this;
  }

  eq(key: string, value: unknown) {
    this.filters.push([key, value]);
    return this;
  }

  update(values: Record<string, unknown>) {
    this.updateValues = values;
    return this;
  }

  upsert(values: Record<string, unknown>) {
    this.upsertValues = values;
    return this;
  }

  async maybeSingle() {
    if (this.updateValues) this.applyUpdate();
    return { data: this.matchingRows()[0] || null, error: null };
  }

  async single() {
    if (this.upsertValues) this.applyUpsert();
    if (this.updateValues) this.applyUpdate();
    const data = this.matchingRows()[0] || null;
    return { data, error: data ? null : { message: "row not found" } };
  }

  private matchingRows() {
    return this.rows.filter(row => this.filters.every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value));
  }

  private applyUpdate() {
    const matches = this.matchingRows();
    matches.forEach(row => Object.assign(row, this.updateValues));
  }

  private applyUpsert() {
    const productId = this.upsertValues?.product_id;
    const amazonEmail = this.upsertValues?.amazon_email_id;
    let row = this.rows.find(item => item.product_id === productId && item.amazon_email_id === amazonEmail);
    if (!row) {
      row = {
        id: crypto.randomUUID(),
        product_id: productId as Row["product_id"],
        country: String(this.upsertValues?.country || ""),
        email_id: String(this.upsertValues?.email_id || ""),
        amazon_email_id: String(amazonEmail || ""),
        status: "active",
        is_pro_user: false,
        access_expires_at: null,
      };
      this.rows.push(row);
    }
    Object.assign(row, this.upsertValues);
    this.filters.push(["id", row.id]);
  }
}

function fakeSupabase(rows: Row[] = []) {
  const from = vi.fn(() => new Query(rows));
  return {
    from,
    schema: vi.fn(() => ({ from })),
  } as unknown as SupabaseClient;
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: crypto.randomUUID(),
    product_id: "amazon-warehouse-jobs-uk",
    country: "UK",
    email_id: "buyer@example.com",
    amazon_email_id: "amazon@example.com",
    status: "active",
    is_pro_user: false,
    access_expires_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.DODO_PAYMENTS_API_KEY = "dodo-key";
  process.env.DODO_PAYMENTS_WEBHOOK_KEY = "webhook-key";
  process.env.DODO_PAYMENTS_ENVIRONMENT = "test_mode";
  process.env.PAYMENT_PROVIDER = "dodo";
  process.env.NEXT_PUBLIC_APP_URL = "https://tracker.example.com";
  process.env.DODO_PRODUCT_UK_ACCESS = "prod_uk_access";
  process.env.DODO_PRODUCT_CANADA_ACCESS = "prod_ca_access";
  process.env.DODO_PRODUCT_UK_PRO = "prod_uk_pro";
  process.env.DODO_PRODUCT_CANADA_PRO = "prod_ca_pro";
  process.env.PADDLE_API_KEY = "paddle-key";
  process.env.PADDLE_WEBHOOK_SECRET = "paddle-webhook";
  process.env.PADDLE_ENVIRONMENT = "sandbox";
  process.env.PADDLE_PRICE_UK_ACCESS = "pri_uk_access";
  process.env.PADDLE_PRICE_CANADA_ACCESS = "pri_ca_access";
  process.env.PADDLE_PRICE_UK_PRO = "pri_uk_pro";
  process.env.SUPABASE_EXTENSION_SCHEMA = "extension_access";
  process.env.SUPABASE_EXTENSION_USERS_TABLE = "users";
  process.env.ACCESS_DAYS_PER_PURCHASE = "30";
  process.env.UK_ACCESS_DAYS_PER_PURCHASE = "30";
  process.env.CANADA_ACCESS_DAYS_PER_PURCHASE = "30";
  process.env.PRO_ACCESS_DAYS_PER_PURCHASE = "365";
  process.env.UK_PRO_ACCESS_DAYS_PER_PURCHASE = "365";
  process.env.CANADA_PRO_ACCESS_DAYS_PER_PURCHASE = "365";
  resetPaymentProvidersForTests();
  setDodoClientForTests(null);
  setPaddleClientForTests(null);
  setSupabaseAdminForTests(null);
});

describe("license checks", () => {
  it("returns denied for an unknown Amazon email", async () => {
    setSupabaseAdminForTests(fakeSupabase([]));

    const response = await checkLicense("amazon-warehouse-jobs-uk", "missing@example.com");

    expect(response.allowed).toBe(false);
    expect(response.message).toMatch(/not registered/);
  });

  it("allows active paid-access and pro users", async () => {
    const rows = [
      row({ amazon_email_id: "access@example.com", access_expires_at: "2026-02-01T00:00:00.000Z" }),
      row({ amazon_email_id: "pro@example.com", is_pro_user: true }),
    ];
    setSupabaseAdminForTests(fakeSupabase(rows));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const access = await checkLicense("amazon-warehouse-jobs-uk", "access@example.com");
    expect(access.allowed).toBe(true);
    expect(access.isProUser).toBe(true);
    expect((await checkLicense("amazon-warehouse-jobs-uk", "pro@example.com")).allowed).toBe(true);
  });

  it("denies disabled users even when access has not expired", async () => {
    setSupabaseAdminForTests(fakeSupabase([row({ status: "disabled", access_expires_at: "2026-02-01T00:00:00.000Z" })]));

    const response = await checkLicense("amazon-warehouse-jobs-uk", "amazon@example.com");

    expect(response.allowed).toBe(false);
    expect(response.isProUser).toBe(false);
  });
});

describe("checkout", () => {
  it("defaults to Dodo and creates or updates one row without resetting existing access", async () => {
    const rows = [row({ access_expires_at: "2026-02-01T00:00:00.000Z" })];
    setSupabaseAdminForTests(fakeSupabase(rows));
    const create = vi.fn(async () => ({
      session_id: "cs_123",
      checkout_url: "https://checkout.dodo/session",
      payment_id: null,
    }));
    setDodoClientForTests({ checkoutSessions: { create } } as never);

    expect(defaultPaymentProvider().id).toBe("dodo");
    const response = await createCheckout("amazon-warehouse-jobs-uk", {
      emailId: "Buyer@Example.com",
      amazonEmailId: "Amazon@Example.com",
      purchaseType: "access",
    });

    expect(response.checkoutUrl).toBe("https://checkout.dodo/session");
    expect(rows).toHaveLength(1);
    expect(rows[0].access_expires_at).toBe("2026-02-01T00:00:00.000Z");
    expect(rows[0].payment_checkout_session_id).toBe("cs_123");
    expect(rows[0].payment_provider).toBe("dodo");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      product_cart: [{ product_id: "prod_uk_access", quantity: 1 }],
      metadata: expect.objectContaining({
        product_id: "amazon-warehouse-jobs-uk",
        email_id: "buyer@example.com",
        amazon_email_id: "amazon@example.com",
      }),
    }));
  });

  it("creates a Dodo checkout session without showing a local email form", async () => {
    const rows: Row[] = [];
    setSupabaseAdminForTests(fakeSupabase(rows));
    const create = vi.fn(async () => ({
      session_id: "cs_direct",
      checkout_url: "https://checkout.dodo/direct",
      payment_id: null,
    }));
    setDodoClientForTests({ checkoutSessions: { create } } as never);

    const response = await createCheckout("amazon-warehouse-jobs-uk", {
      purchaseType: "access",
    });

    expect(response.checkoutUrl).toBe("https://checkout.dodo/direct");
    expect(rows).toHaveLength(0);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      product_cart: [{ product_id: "prod_uk_access", quantity: 1 }],
      metadata: expect.objectContaining({
        product_id: "amazon-warehouse-jobs-uk",
        purchase_type: "access",
      }),
      custom_fields: [
        expect.objectContaining({
          key: "amazon_email_id",
          field_type: "email",
          label: "Amazon job-search email - this Amazon Jobs account will receive this access",
          required: true,
        }),
      ],
    }));
    expect(create).toHaveBeenCalledWith(expect.not.objectContaining({
      customer: expect.anything(),
    }));
  });

  it("uses Paddle checkout through the same service method when configured", async () => {
    process.env.PAYMENT_PROVIDER = "paddle";
    resetPaymentProvidersForTests();
    const rows = [row({ access_expires_at: "2026-02-01T00:00:00.000Z" })];
    setSupabaseAdminForTests(fakeSupabase(rows));
    const create = vi.fn(async () => ({
      id: "txn_123",
      checkout: { url: "https://checkout.paddle/txn_123" },
      customerId: "ctm_123",
      subscriptionId: null,
    }));
    setPaddleClientForTests({ transactions: { create } } as never);

    expect(defaultPaymentProvider().id).toBe("paddle");
    const response = await createCheckout("amazon-warehouse-jobs-uk", {
      emailId: "Buyer@Example.com",
      amazonEmailId: "Amazon@Example.com",
      purchaseType: "access",
    });

    expect(response.checkoutUrl).toBe("https://checkout.paddle/txn_123");
    expect(rows[0].access_expires_at).toBe("2026-02-01T00:00:00.000Z");
    expect(rows[0].payment_provider).toBe("paddle");
    expect(rows[0].payment_checkout_session_id).toBe("txn_123");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ priceId: "pri_uk_access", quantity: 1 }],
      customData: expect.objectContaining({
        product_id: "amazon-warehouse-jobs-uk",
        email_id: "buyer@example.com",
        amazon_email_id: "amazon@example.com",
      }),
    }));
  });

  it("routes subscription helpers through the configured provider", async () => {
    process.env.PAYMENT_PROVIDER = "paddle";
    resetPaymentProvidersForTests();
    const provider = {
      id: "paddle",
      createCheckout: vi.fn(),
      verifyWebhook: vi.fn(),
      getSubscription: vi.fn(async id => ({ provider: "paddle" as const, id, status: "active", customerId: "ctm_123" })),
      cancelSubscription: vi.fn(async () => undefined),
    } satisfies PaymentProvider;
    setPaymentProviderForTests(provider, "paddle");

    await expect(defaultPaymentProvider().getSubscription("sub_123")).resolves.toMatchObject({
      id: "sub_123",
      status: "active",
    });
    await defaultPaymentProvider().cancelSubscription("sub_123");

    expect(provider.getSubscription).toHaveBeenCalledWith("sub_123");
    expect(provider.cancelSubscription).toHaveBeenCalledWith("sub_123");
  });
});

describe("webhooks", () => {
  const metadata = {
    product_id: "amazon-warehouse-jobs-uk" as const,
    country: "UK",
    email_id: "buyer@example.com",
    amazon_email_id: "amazon@example.com",
    purchase_type: "access" as const,
  };

  it("normalizes Dodo and Paddle successful payment events", () => {
    expect(normalizeDodoWebhookEvent({
      type: "payment.succeeded",
      timestamp: "2026-01-01T00:00:00Z",
      data: {
        payment_id: "pay_123",
        checkout_session_id: "cs_123",
        customer_id: "cus_123",
        customer: { email: "buyer@example.com" },
        total_amount: 1000,
        currency: "gbp",
        metadata,
      },
    })).toMatchObject({
      provider: "dodo",
      type: "payment_succeeded",
      eventId: "payment.succeeded:pay_123",
      paymentId: "pay_123",
      customerEmail: "buyer@example.com",
      metadata,
    });

    expect(normalizePaddleWebhookEvent({
      eventId: "evt_123",
      eventType: "transaction.paid",
      data: {
        id: "txn_123",
        customerId: "ctm_123",
        customData: metadata,
        currencyCode: "GBP",
        details: { totals: { total: "1200" } },
      },
    })).toMatchObject({
      provider: "paddle",
      type: "payment_succeeded",
      eventId: "evt_123",
      paymentId: "txn_123",
      metadata,
    });
  });

  it("extends 30-day access once for successful Dodo payment events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const rows = [row({ access_expires_at: null })];
    setSupabaseAdminForTests(fakeSupabase(rows));
    const event = {
      provider: "dodo" as const,
      eventId: "payment.succeeded:pay_123",
      type: "payment_succeeded" as const,
      paymentId: "pay_123",
      checkoutSessionId: "cs_123",
      customerId: "cus_123",
      amountCents: 1000,
      currency: "gbp",
      metadata,
    };

    await processPaymentWebhookEvent(event);
    await processPaymentWebhookEvent(event);

    expect(rows[0].access_expires_at).toBe("2026-01-31T00:00:00.000Z");
    expect(rows[0].last_payment_access_days).toBe(30);
    expect(rows[0].last_payment_event_id).toBe("payment.succeeded:pay_123");
    expect(rows[0].payment_provider).toBe("dodo");
  });

  it("creates the paid access row from Dodo checkout emails when no row exists yet", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const rows: Row[] = [];
    setSupabaseAdminForTests(fakeSupabase(rows));

    await processPaymentWebhookEvent({
      provider: "dodo",
      eventId: "payment.succeeded:pay_direct",
      type: "payment_succeeded",
      paymentId: "pay_direct",
      checkoutSessionId: "cs_direct",
      customerId: "cus_direct",
      customerEmail: "buyer@example.com",
      amountCents: 1000,
      currency: "gbp",
      metadata: {
        product_id: "amazon-warehouse-jobs-uk",
        country: "UK",
        amazon_email_id: "amazon@example.com",
        purchase_type: "access",
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      product_id: "amazon-warehouse-jobs-uk",
      email_id: "buyer@example.com",
      amazon_email_id: "amazon@example.com",
      access_expires_at: "2026-01-31T00:00:00.000Z",
      payment_checkout_session_id: "cs_direct",
      payment_customer_id: "cus_direct",
    });
  });

  it("marks refunded rows as refunded", async () => {
    const rows = [row()];
    setSupabaseAdminForTests(fakeSupabase(rows));

    await processPaymentWebhookEvent({
      provider: "dodo",
      eventId: "refund.succeeded:pay_123",
      type: "refund_succeeded",
      paymentId: "pay_123",
      metadata,
    });

    expect(rows[0].status).toBe("refunded");
  });

  it("marks disputed rows as blocked and ignores events missing metadata", async () => {
    const rows = [row({ access_expires_at: "2026-02-01T00:00:00.000Z" })];
    setSupabaseAdminForTests(fakeSupabase(rows));

    const denied = await processPaymentWebhookEvent({
      provider: "paddle",
      eventId: "evt_missing",
      type: "payment_succeeded",
      metadata: null,
    });
    expect(denied.allowed).toBe(false);
    expect(rows[0].access_expires_at).toBe("2026-02-01T00:00:00.000Z");

    await processPaymentWebhookEvent({
      provider: "paddle",
      eventId: "evt_dispute",
      type: "dispute_opened",
      paymentId: "txn_123",
      metadata,
    });
    expect(rows[0].status).toBe("blocked");
  });

  it("activates annual pro access without permanent lifetime access", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const rows = [row({ is_pro_user: false })];
    setSupabaseAdminForTests(fakeSupabase(rows));

    await processPaymentWebhookEvent({
      provider: "dodo",
      eventId: "payment.succeeded:pay_pro",
      type: "payment_succeeded",
      paymentId: "pay_pro",
      metadata: { ...metadata, purchase_type: "pro" },
    });

    expect(rows[0].is_pro_user).toBe(false);
    expect(rows[0].access_expires_at).toBe("2027-01-01T00:00:00.000Z");
    expect(rows[0].last_payment_access_days).toBe(365);
  });

  it("keeps Canada and UK access separate for the same Amazon email", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const rows = [
      row({ product_id: "amazon-warehouse-jobs-uk", country: "UK", amazon_email_id: "same@example.com", access_expires_at: null }),
      row({ product_id: "amazon-warehouse-jobs-canada", country: "CA", amazon_email_id: "same@example.com", access_expires_at: null }),
    ];
    setSupabaseAdminForTests(fakeSupabase(rows));

    await processPaymentWebhookEvent({
      provider: "dodo",
      eventId: "payment.succeeded:pay_ca",
      type: "payment_succeeded",
      paymentId: "pay_ca",
      metadata: {
        product_id: "amazon-warehouse-jobs-canada",
        country: "CA",
        email_id: "buyer@example.com",
        amazon_email_id: "same@example.com",
        purchase_type: "access",
      },
    });

    expect(rows.find(item => item.product_id === "amazon-warehouse-jobs-canada")?.access_expires_at).toBe("2026-01-31T00:00:00.000Z");
    expect(rows.find(item => item.product_id === "amazon-warehouse-jobs-uk")?.access_expires_at).toBeNull();
  });
});

describe("usage", () => {
  it("records booking success for active paid access", async () => {
    const rows = [row({ access_expires_at: "2026-02-01T00:00:00.000Z" })];
    setSupabaseAdminForTests(fakeSupabase(rows));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const request = {
      amazonEmailId: "amazon@example.com",
      idempotencyKey: "booking-1",
      metadata: {},
    };

    await recordUsage("amazon-warehouse-jobs-uk", request);
    await recordUsage("amazon-warehouse-jobs-uk", request);

    expect(rows[0].last_booking_usage_key).toBe("booking-1");
  });

  it("denies booking usage when paid access has expired", async () => {
    const rows = [row({ access_expires_at: "2025-12-31T23:59:59.000Z" })];
    setSupabaseAdminForTests(fakeSupabase(rows));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const response = await recordUsage("amazon-warehouse-jobs-uk", {
      amazonEmailId: "amazon@example.com",
      idempotencyKey: "booking-expired",
      metadata: {},
    });

    expect(response.allowed).toBe(false);
    expect(rows[0].last_booking_usage_key).toBeUndefined();
  });

  it("records pro usage", async () => {
    const rows = [row({ is_pro_user: true })];
    setSupabaseAdminForTests(fakeSupabase(rows));

    const response = await recordUsage("amazon-warehouse-jobs-uk", {
      amazonEmailId: "amazon@example.com",
      idempotencyKey: "booking-pro",
      metadata: {},
    });

    expect(response.allowed).toBe(true);
    expect(rows[0].last_booking_usage_key).toBe("booking-pro");
  });
});
