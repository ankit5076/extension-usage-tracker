"use client";

import { FormEvent, useState } from "react";

type CheckoutFormProps = {
  productId: string;
  extensionName: string;
  country: string;
  initialPurchaseType?: "credits" | "pro";
  apiBasePath?: string;
};

type CheckoutResponse = {
  checkoutUrl?: string;
  message?: string;
};

function withBasePath(basePath: string, path: string): string {
  const prefix = basePath.replace(/\/+$/, "");
  return `${prefix}${path}`;
}

export function CheckoutForm({
  productId,
  extensionName,
  country,
  initialPurchaseType = "credits",
  apiBasePath = "",
}: CheckoutFormProps) {
  const [emailId, setEmailId] = useState("");
  const [amazonEmailId, setAmazonEmailId] = useState("");
  const [purchaseType, setPurchaseType] = useState<"credits" | "pro">(initialPurchaseType);
  const [error, setError] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(withBasePath(apiBasePath, `/api/${encodeURIComponent(productId)}/license/checkout`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emailId,
          amazonEmailId,
          purchaseType,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as CheckoutResponse;
      if (!response.ok || !body.checkoutUrl) {
        throw new Error(body.message || "Unable to start checkout. Please try again.");
      }
      window.location.assign(body.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start checkout.");
      setSubmitting(false);
    }
  }

  return (
    <main className="checkout-shell">
      <section className="checkout-panel" aria-labelledby="checkout-title">
        <p className="checkout-kicker">{country} extension</p>
        <h1 id="checkout-title">{extensionName}</h1>
        <p className="checkout-copy">
          Choose your access window, then enter the buyer email and the Amazon Jobs email that will use this purchase.
        </p>
        <div className="checkout-plans" role="radiogroup" aria-label="Choose access plan">
          <button
            className={purchaseType === "credits" ? "checkout-plan selected" : "checkout-plan"}
            type="button"
            onClick={() => setPurchaseType("credits")}
            aria-pressed={purchaseType === "credits"}
          >
            <span className="checkout-plan-name">30-Day Access</span>
            <strong>$50</strong>
            <span>Unlimited bookings for 30 days</span>
          </button>
          <button
            className={purchaseType === "pro" ? "checkout-plan selected" : "checkout-plan"}
            type="button"
            onClick={() => setPurchaseType("pro")}
            aria-pressed={purchaseType === "pro"}
          >
            <span className="checkout-plan-name">Pro Annual</span>
            <strong>$120</strong>
            <span>Unlimited bookings for 1 full year</span>
          </button>
        </div>
        <form className="checkout-form" onSubmit={submit}>
          <label>
            Buyer email
            <input
              type="email"
              name="emailId"
              autoComplete="email"
              value={emailId}
              onChange={event => setEmailId(event.target.value)}
              required
            />
          </label>
          <label>
            Amazon job-search email
            <input
              type="email"
              name="amazonEmailId"
              autoComplete="email"
              value={amazonEmailId}
              onChange={event => setAmazonEmailId(event.target.value)}
              required
            />
          </label>
          {error ? <p className="checkout-error" role="alert">{error}</p> : null}
          <button className="checkout-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Opening payment..." : "Continue to payment"}
          </button>
        </form>
      </section>
    </main>
  );
}
