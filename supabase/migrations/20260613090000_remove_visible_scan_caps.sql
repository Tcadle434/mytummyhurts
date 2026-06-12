-- Scan counts disappear from the product: subscribers get an effectively
-- unlimited monthly allowance (1000) so the token machinery stays intact but
-- exhaustion is unreachable. Real cost control moves to a rolling 24h cap in
-- scan analysis (soft cap logs scan_daily_soft_cap_exceeded system events for
-- monitoring; hard cap blocks at SCAN_DAILY_HARD_CAP, default 60/day).

alter table public.users
  alter column default_monthly_token_allowance set default 1000;

update public.users
set default_monthly_token_allowance = 1000
where default_monthly_token_allowance < 1000;

-- Top up existing balances through the ledger RPC so token_transactions
-- stays consistent with the new allowance.
do $$
declare
  r record;
begin
  for r in
    select id from public.users where current_token_balance < 1000
  loop
    perform public.set_token_balance(r.id, 1000, 'scan_cap_removal', null);
  end loop;
end $$;
