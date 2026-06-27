import { NextResponse } from "next/server";
import { processPaymentWebhookEvent } from "../license-service";
import { getPaymentProvider } from "./registry";
import type { PaymentProviderId } from "./types";

export async function handlePaymentWebhook(request: Request, providerId: PaymentProviderId) {
  try {
    const event = await getPaymentProvider(providerId).verifyWebhook(request);
    await processPaymentWebhookEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
