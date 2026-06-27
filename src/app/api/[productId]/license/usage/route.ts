import { NextRequest } from "next/server";
import { optionsResponse, jsonResponse } from "@/lib/cors";
import { recordUsage } from "@/lib/license-service";
import { errorResponse } from "@/lib/route-utils";
import { UsageRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ productId: string }> };

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { productId } = await context.params;
    const body = UsageRequestSchema.parse(await request.json());
    return jsonResponse(request, await recordUsage(productId, body));
  } catch (error) {
    return errorResponse(request, error);
  }
}
