import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { optionsResponse } from "./cors";

describe("CORS", () => {
  it("allows configured extension origins on preflight", () => {
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://abc";
    const request = new NextRequest("https://tracker.example.com/api/x", {
      headers: { origin: "chrome-extension://abc" },
    });

    const response = optionsResponse(request);

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("chrome-extension://abc");
  });
});
