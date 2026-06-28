alter table extension_access.users
  add column if not exists access_expires_at timestamptz,
  add column if not exists last_payment_access_days integer;
