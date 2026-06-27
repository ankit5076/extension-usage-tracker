import { NextRequest, NextResponse } from "next/server";
import { handlePaymentWebhook } from "@/lib/payments/webhook-route";
import type { PaymentProviderId } from "@/lib/payments/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ provider: string }>;
}

function isPaymentProviderId(value: string): value is PaymentProviderId {
  return value === "dodo" || value === "paddle";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { provider } = await context.params;
  if (!isPaymentProviderId(provider)) {
    return NextResponse.json({ error: `Unsupported payment provider: ${provider}` }, { status: 404 });
  }
  return handlePaymentWebhook(request, provider);
}
