import { numericEnv, optionalEnv } from "./config";
import type { PaymentProviderId } from "./config";

export type ProductId = "amazon-warehouse-jobs-canada" | "amazon-warehouse-jobs-uk";
export type PurchaseType = "access" | "pro";

export interface ProductConfig {
  productId: ProductId;
  country: "CA" | "UK";
  extensionName: string;
  dodoAccessProductId: string;
  dodoProProductId: string;
  paddleAccessPriceId: string;
  paddleProPriceId: string;
  accessDaysPerPurchase: number;
  proAccessDaysPerPurchase: number;
}

export interface PurchaseConfig {
  providerPriceId: string;
  purchaseType: PurchaseType;
  accessDays: number;
  isPro: boolean;
}

function products(): Record<ProductId, ProductConfig> {
  return {
    "amazon-warehouse-jobs-canada": {
      productId: "amazon-warehouse-jobs-canada",
      country: "CA",
      extensionName: "Amazon Warehouse Jobs Canada",
      dodoAccessProductId: optionalEnv("DODO_PRODUCT_CANADA_ACCESS"),
      dodoProProductId: optionalEnv("DODO_PRODUCT_CANADA_PRO"),
      paddleAccessPriceId: optionalEnv("PADDLE_PRICE_CANADA_ACCESS"),
      paddleProPriceId: optionalEnv("PADDLE_PRICE_CANADA_PRO"),
      accessDaysPerPurchase: numericEnv("CANADA_ACCESS_DAYS_PER_PURCHASE", numericEnv("ACCESS_DAYS_PER_PURCHASE", 30)),
      proAccessDaysPerPurchase: numericEnv("CANADA_PRO_ACCESS_DAYS_PER_PURCHASE", numericEnv("PRO_ACCESS_DAYS_PER_PURCHASE", 365)),
    },
    "amazon-warehouse-jobs-uk": {
      productId: "amazon-warehouse-jobs-uk",
      country: "UK",
      extensionName: "Amazon Warehouse Jobs UK",
      dodoAccessProductId: optionalEnv("DODO_PRODUCT_UK_ACCESS"),
      dodoProProductId: optionalEnv("DODO_PRODUCT_UK_PRO"),
      paddleAccessPriceId: optionalEnv("PADDLE_PRICE_UK_ACCESS"),
      paddleProPriceId: optionalEnv("PADDLE_PRICE_UK_PRO"),
      accessDaysPerPurchase: numericEnv("UK_ACCESS_DAYS_PER_PURCHASE", numericEnv("ACCESS_DAYS_PER_PURCHASE", 30)),
      proAccessDaysPerPurchase: numericEnv("UK_PRO_ACCESS_DAYS_PER_PURCHASE", numericEnv("PRO_ACCESS_DAYS_PER_PURCHASE", 365)),
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
  purchaseType: PurchaseType = "access",
  providerId: PaymentProviderId = "dodo"
): PurchaseConfig {
  const providerPriceId =
    providerId === "paddle"
      ? purchaseType === "pro"
        ? product.paddleProPriceId
        : product.paddleAccessPriceId
      : purchaseType === "pro"
        ? product.dodoProProductId
        : product.dodoAccessProductId;
  if (!providerPriceId) {
    throw new Error(`${providerId} ${purchaseType} product is not configured for ${product.productId}`);
  }
  return {
    providerPriceId,
    purchaseType,
    accessDays: purchaseType === "pro" ? product.proAccessDaysPerPurchase : product.accessDaysPerPurchase,
    isPro: purchaseType === "pro",
  };
}

export function availablePlans(productId: string, providerId: PaymentProviderId = "dodo") {
  const product = requireProduct(productId);
  const accessProductId = providerId === "paddle" ? product.paddleAccessPriceId : product.dodoAccessProductId;
  const proProductId = providerId === "paddle" ? product.paddleProPriceId : product.dodoProProductId;
  return {
    productId: product.productId,
    provider: providerId,
    plans: {
      access: Boolean(accessProductId),
      pro: Boolean(proProductId),
    },
  };
}
