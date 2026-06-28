import { beforeEach, describe, expect, it } from "vitest";
import { availablePlans } from "./products";

beforeEach(() => {
  process.env.DODO_PRODUCT_UK_ACCESS = "prod_uk_access";
  delete process.env.DODO_PRODUCT_UK_PRO;
  process.env.PADDLE_PRICE_UK_ACCESS = "pri_uk_access";
  process.env.PADDLE_PRICE_UK_PRO = "pri_uk_pro";
});

describe("product plan availability", () => {
  it("reports provider-specific access and pro configuration", () => {
    expect(availablePlans("amazon-warehouse-jobs-uk", "dodo")).toEqual({
      productId: "amazon-warehouse-jobs-uk",
      provider: "dodo",
      plans: {
        access: true,
        pro: false,
      },
    });

    expect(availablePlans("amazon-warehouse-jobs-uk", "paddle")).toEqual({
      productId: "amazon-warehouse-jobs-uk",
      provider: "paddle",
      plans: {
        access: true,
        pro: true,
      },
    });
  });
});
