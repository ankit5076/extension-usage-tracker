import { numericEnv, optionalEnv } from "./config";
import type { PaymentProviderId } from "./config";

export type ProductId = "amazon-warehouse-jobs-canada" | "amazon-warehouse-jobs-uk";
export type PurchaseType = "credits" | "pro";

export interface ProductConfig {
  productId: ProductId;
  country: "CA" | "UK";
  extensionName: string;
  dodoCreditsProductId: string;
  dodoProProductId: string;
  paddleCreditsPriceId: string;
  paddleProPriceId: string;
  creditsPerPurchase: number;
}

export interface PurchaseConfig {
  providerPriceId: string;
  purchaseType: PurchaseType;
  credits: number;
  isPro: boolean;
}

function products(): Record<ProductId, ProductConfig> {
  return {
    "amazon-warehouse-jobs-canada": {
      productId: "amazon-warehouse-jobs-canada",
      country: "CA",
      extensionName: "Amazon Warehouse Jobs Canada",
      dodoCreditsProductId: optionalEnv("DODO_PRODUCT_CANADA_CREDITS"),
      dodoProProductId: optionalEnv("DODO_PRODUCT_CANADA_PRO"),
      paddleCreditsPriceId: optionalEnv("PADDLE_PRICE_CANADA_CREDITS"),
      paddleProPriceId: optionalEnv("PADDLE_PRICE_CANADA_PRO"),
      creditsPerPurchase: numericEnv("CANADA_CREDITS_PER_PURCHASE", 5),
    },
    "amazon-warehouse-jobs-uk": {
      productId: "amazon-warehouse-jobs-uk",
      country: "UK",
      extensionName: "Amazon Warehouse Jobs UK",
      dodoCreditsProductId: optionalEnv("DODO_PRODUCT_UK_CREDITS"),
      dodoProProductId: optionalEnv("DODO_PRODUCT_UK_PRO"),
      paddleCreditsPriceId: optionalEnv("PADDLE_PRICE_UK_CREDITS"),
      paddleProPriceId: optionalEnv("PADDLE_PRICE_UK_PRO"),
      creditsPerPurchase: numericEnv("UK_CREDITS_PER_PURCHASE", 5),
    },
  };
}

export function productConfig(productId: string): ProductConfig | null {
  const currentProducts = products();
  return Object.prototype.hasOwnProperty.call(currentProducts, productId) ? currentProducts[productId as ProductId] : null;
}

export function requireProduct(productId: string): ProductConfig {
  const product = productConfig(productId);
  if (!product) throw new Error(`Unsupported product id: ${productId}`);
  return product;
}

export function purchaseConfig(
  product: ProductConfig,
  purchaseType: PurchaseType = "credits",
  providerId: PaymentProviderId = "dodo"
): PurchaseConfig {
  const providerPriceId =
    providerId === "paddle"
      ? purchaseType === "pro"
        ? product.paddleProPriceId
        : product.paddleCreditsPriceId
      : purchaseType === "pro"
        ? product.dodoProProductId
        : product.dodoCreditsProductId;
  if (!providerPriceId) {
    throw new Error(`${providerId} ${purchaseType} product is not configured for ${product.productId}`);
  }
  return {
    providerPriceId,
    purchaseType,
    credits: purchaseType === "pro" ? 0 : product.creditsPerPurchase,
    isPro: purchaseType === "pro",
  };
}
