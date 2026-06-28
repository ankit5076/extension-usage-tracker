import { notFound } from "next/navigation";
import { appBasePath } from "@/lib/config";
import { productConfig } from "@/lib/products";
import { CheckoutForm } from "./checkout-form";

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
  const initialPurchaseType = plan === "pro" ? "pro" : "credits";

  return (
    <CheckoutForm
      productId={product.productId}
      extensionName={product.extensionName}
      country={product.country}
      initialPurchaseType={initialPurchaseType}
      apiBasePath={appBasePath()}
    />
  );
}
