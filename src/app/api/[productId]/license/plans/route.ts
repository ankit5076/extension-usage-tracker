import { NextRequest } from "next/server";
import { optionsResponse, jsonResponse } from "@/lib/cors";
import { paymentProviderId } from "@/lib/config";
import { availablePlans } from "@/lib/products";
import { errorResponse } from "@/lib/route-utils";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ productId: string }> };

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { productId } = await context.params;
    return jsonResponse(request, availablePlans(productId, paymentProviderId()));
  } catch (error) {
    return errorResponse(request, error);
  }
}
