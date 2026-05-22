alter table public.menu_items
  drop constraint if exists menu_items_tier_rank_check;

alter table public.menu_items
  add constraint menu_items_tier_rank_check
  check (tier_rank >= 1 and tier_rank <= 100);

create index if not exists menu_items_scan_display_order_idx
  on public.menu_items (scan_id, display_order);
