import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { createCheckout } from "@/lib/license-service";
import { productConfig } from "@/lib/products";

export const runtime = "nodejs";

type CheckoutPageProps = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ plan?: string; purchaseType?: string }>;
};

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { productId } = await params;
  const query = await searchParams;
  const product = productConfig(productId);
  if (!product) notFound();
  const plan = query.purchaseType || query.plan;
  const initialPurchaseType = plan === "pro" ? "pro" : "access";
  const checkout = await createCheckout(product.productId, { purchaseType: initialPurchaseType });
  if (checkout.checkoutUrl) redirect(checkout.checkoutUrl);

  return (
    <main className="checkout-shell">
      <section className="checkout-panel" aria-labelledby="checkout-title">
        <p className="checkout-kicker">{product.country} extension</p>
        <h1 id="checkout-title">{product.extensionName}</h1>
        <p className="checkout-copy">Unable to open payment checkout. Please try again from the extension.</p>
      </section>
    </main>
  );
}
