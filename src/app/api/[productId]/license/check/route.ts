import { NextRequest } from "next/server";
import { optionsResponse, jsonResponse } from "@/lib/cors";
import { checkLicense } from "@/lib/license-service";
import { errorResponse } from "@/lib/route-utils";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ productId: string }> };

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { productId } = await context.params;
    const amazonEmail = request.nextUrl.searchParams.get("amazonEmail") ||
      request.nextUrl.searchParams.get("amazonEmailId") ||
      request.nextUrl.searchParams.get("email") ||
      "";
    if (!amazonEmail.trim()) throw new Error("amazonEmail is required");
    return jsonResponse(request, await checkLicense(productId, amazonEmail));
  } catch (error) {
    return errorResponse(request, error);
  }
}
