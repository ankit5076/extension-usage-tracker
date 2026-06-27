import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { jsonResponse } from "./cors";

export function errorResponse(request: NextRequest, error: unknown) {
  if (error instanceof ZodError) {
    return jsonResponse(request, { error: error.issues.map(issue => issue.message).join("; ") }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const status = message.includes("required") || message.includes("Unsupported product") ? 400 : 500;
  return jsonResponse(request, { error: message }, { status });
}
