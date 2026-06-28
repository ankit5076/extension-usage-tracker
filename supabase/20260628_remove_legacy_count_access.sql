alter table extension_access.users
  add column if not exists access_expires_at timestamptz,
  add column if not exists last_payment_access_days integer;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'extension_access'
      and table_name = 'users'
      and column_name = 'last_booking_deduction_key'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'extension_access'
      and table_name = 'users'
      and column_name = 'last_booking_usage_key'
  ) then
    alter table extension_access.users
      rename column last_booking_deduction_key to last_booking_usage_key;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'extension_access'
      and table_name = 'users'
      and column_name = 'last_credit_deducted_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'extension_access'
      and table_name = 'users'
      and column_name = 'last_booking_recorded_at'
  ) then
    alter table extension_access.users
      rename column last_credit_deducted_at to last_booking_recorded_at;
  end if;
end $$;

alter table extension_access.users
  drop column if exists credits_available,
  drop column if exists last_payment_credits,
  drop column if exists last_booking_deduction_key,
  drop column if exists last_credit_deducted_at;
