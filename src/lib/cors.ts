import { NextRequest, NextResponse } from "next/server";
import { allowedExtensionOrigins } from "./config";

const commonHeaders = {
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export function corsHeaders(request: Request | NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedExtensionOrigins();
  if (!origin) return { ...commonHeaders };
  if (allowed.length === 0 || allowed.includes(origin)) {
    return {
      ...commonHeaders,
      "access-control-allow-origin": origin,
      vary: "origin",
    };
  }
  return { ...commonHeaders };
}

export function jsonResponse(request: Request | NextRequest, body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(request),
      ...(init.headers || {}),
    },
  });
}

export function optionsResponse(request: Request | NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}
