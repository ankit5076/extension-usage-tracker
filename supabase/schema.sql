create extension if not exists pgcrypto;

create schema if not exists extension_access;

revoke all on schema extension_access from public, anon, authenticated;
grant usage on schema extension_access to service_role;

create table if not exists extension_access.users (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  country text not null,
  email_id text not null,
  amazon_email_id text not null,
  status text not null default 'active',
  is_pro_user boolean not null default false,
  access_expires_at timestamptz,
  payment_provider text not null default 'dodo',
  payment_customer_id text,
  payment_checkout_session_id text,
  payment_subscription_id text,
  payment_id text,
  last_payment_status text,
  last_payment_amount_cents integer,
  last_payment_currency text,
  last_payment_access_days integer,
  last_payment_at timestamptz,
  last_payment_event_id text,
  last_subscription_status text,
  last_booking_usage_key text,
  last_booking_recorded_at timestamptz,
  license_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, amazon_email_id),
  check (status in ('active', 'disabled', 'refunded', 'blocked'))
);

create index if not exists idx_extension_access_users_email_id_lower
  on extension_access.users (lower(email_id));
create index if not exists idx_extension_access_users_amazon_email_id_lower
  on extension_access.users (lower(amazon_email_id));
create index if not exists idx_extension_access_users_product_amazon_email
  on extension_access.users (product_id, amazon_email_id);

alter table extension_access.users enable row level security;

revoke all on table extension_access.users from public, anon, authenticated;
grant select, insert, update on table extension_access.users to service_role;

create or replace function extension_access.touch_users_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function extension_access.touch_users_updated_at() from public, anon, authenticated;
grant execute on function extension_access.touch_users_updated_at() to service_role;

drop trigger if exists trg_extension_access_users_updated_at on extension_access.users;
create trigger trg_extension_access_users_updated_at
before update on extension_access.users
for each row
execute function extension_access.touch_users_updated_at();
