import { NextRequest } from "next/server";
import { handlePaymentWebhook } from "@/lib/payments/webhook-route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handlePaymentWebhook(request, "dodo");
}
