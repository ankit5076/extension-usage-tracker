import { z } from "zod";

const EnvironmentSchema = z.enum(["test_mode", "live_mode"]).default("test_mode");
const PaymentProviderSchema = z.enum(["dodo", "paddle"]).default("dodo");
const PaddleEnvironmentSchema = z.enum(["sandbox", "production"]).default("sandbox");

export type DodoEnvironment = z.infer<typeof EnvironmentSchema>;
export type PaymentProviderId = z.infer<typeof PaymentProviderSchema>;
export type PaddleEnvironment = z.infer<typeof PaddleEnvironmentSchema>;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export function optionalEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function appUrl(): string {
  return optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(/\/+$/, "");
}

export function licenseSyncIntervalMs(): number {
  return numericEnv("LICENSE_SYNC_INTERVAL_MS", 900000);
}

export function extensionSupabaseSchema(): string {
  return optionalEnv("SUPABASE_EXTENSION_SCHEMA", "extension_access");
}

export function extensionUsersTable(): string {
  return optionalEnv("SUPABASE_EXTENSION_USERS_TABLE", "users");
}

export function dodoEnvironment(): DodoEnvironment {
  return EnvironmentSchema.parse(optionalEnv("DODO_PAYMENTS_ENVIRONMENT", "test_mode"));
}

export function paymentProviderId(): PaymentProviderId {
  return PaymentProviderSchema.parse(optionalEnv("PAYMENT_PROVIDER", "dodo"));
}

export function paddleEnvironment(): PaddleEnvironment {
  return PaddleEnvironmentSchema.parse(optionalEnv("PADDLE_ENVIRONMENT", "sandbox"));
}

export function allowedExtensionOrigins(): string[] {
  return optionalEnv("ALLOWED_EXTENSION_ORIGINS", "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
}
