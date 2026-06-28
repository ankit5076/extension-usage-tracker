import { z } from "zod";

const email = z.string().trim().toLowerCase().email();
const purchaseType = z.enum(["access", "pro"]).default("access");

export const CheckoutRequestSchema = z.object({
  emailId: email.optional(),
  amazonEmailId: email.optional(),
  purchaseType,
});

const optionalMetadataEmail = z.string().trim().toLowerCase().email().optional();

export const UsageRequestSchema = z.object({
  emailId: email.optional(),
  amazonEmailId: email,
  idempotencyKey: z.string().trim().min(1),
  jobId: z.string().trim().optional().nullable(),
  scheduleId: z.string().trim().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const PaymentMetadataSchema = z.object({
  product_id: z.string().trim().min(1),
  country: z.string().trim().min(1),
  email_id: optionalMetadataEmail,
  amazon_email_id: optionalMetadataEmail,
  purchase_type: purchaseType,
});

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export type UsageRequest = z.infer<typeof UsageRequestSchema>;
export type PaymentMetadata = z.infer<typeof PaymentMetadataSchema>;
