import { paymentProviderId } from "../config";
import { DodoPaymentProvider } from "./dodo-provider";
import { PaddlePaymentProvider } from "./paddle-provider";
import { RazorpayPaymentProvider } from "./razorpay-provider";
import type { PaymentProvider, PaymentProviderId } from "./types";

const providers = new Map<PaymentProviderId, PaymentProvider>();

function createProvider(providerId: PaymentProviderId): PaymentProvider {
  if (providerId === "paddle") return new PaddlePaymentProvider();
  if (providerId === "razorpay") return new RazorpayPaymentProvider();
  return new DodoPaymentProvider();
}

export function getPaymentProvider(providerId: PaymentProviderId): PaymentProvider {
  const existing = providers.get(providerId);
  if (existing) return existing;
  const provider = createProvider(providerId);
  providers.set(providerId, provider);
  return provider;
}

export function defaultPaymentProvider(): PaymentProvider {
  return getPaymentProvider(paymentProviderId());
}

export function setPaymentProviderForTests(provider: PaymentProvider | null, providerId: PaymentProviderId = "dodo") {
  if (provider) {
    providers.set(providerId, provider);
  } else {
    providers.delete(providerId);
  }
}

export function resetPaymentProvidersForTests() {
  providers.clear();
}
