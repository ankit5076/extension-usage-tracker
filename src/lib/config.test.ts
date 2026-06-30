import { afterEach, describe, expect, it } from "vitest";
import { appBasePath, normalizeBasePath, paymentProviderId, razorpayCurrency } from "./config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("public app path", () => {
  it("normalizes an explicit base path", () => {
    expect(normalizeBasePath("extension-usage-tracker/")).toBe("/extension-usage-tracker");
    expect(normalizeBasePath("/extension-usage-tracker/")).toBe("/extension-usage-tracker");
    expect(normalizeBasePath("/")).toBe("");
  });

  it("derives the base path from NEXT_PUBLIC_APP_URL", () => {
    delete process.env.NEXT_PUBLIC_APP_BASE_PATH;
    process.env.NEXT_PUBLIC_APP_URL = "https://getslotnow.com/extension-usage-tracker";

    expect(appBasePath()).toBe("/extension-usage-tracker");
  });

  it("lets NEXT_PUBLIC_APP_BASE_PATH override the URL path", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://getslotnow.com/extension-usage-tracker";
    process.env.NEXT_PUBLIC_APP_BASE_PATH = "/custom-prefix/";

    expect(appBasePath()).toBe("/custom-prefix");
  });

  it("accepts Razorpay as a payment provider and uppercases its currency", () => {
    process.env.PAYMENT_PROVIDER = "razorpay";
    process.env.RAZORPAY_CURRENCY = "usd";

    expect(paymentProviderId()).toBe("razorpay");
    expect(razorpayCurrency()).toBe("USD");
  });
});
