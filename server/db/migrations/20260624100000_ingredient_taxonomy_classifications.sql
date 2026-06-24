create table if not exists public.ingredient_taxonomy_classifications (
  normalized_ingredient_name text primary key,
  display_name text not null,
  primary_food_family_key text not null,
  digestive_pattern_keys jsonb not null default '[]'::jsonb,
  confidence text not null default 'low',
  reason text not null default '',
  taxonomy_version text not null,
  model text,
  prompt_version text,
  source text not null default 'deterministic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredient_taxonomy_confidence_check
    check (confidence in ('high', 'medium', 'low')),
  constraint ingredient_taxonomy_source_check
    check (source in ('llm', 'deterministic', 'manual'))
);

create index if not exists ingredient_taxonomy_classifications_family_idx
  on public.ingredient_taxonomy_classifications (primary_food_family_key);

create index if not exists ingredient_taxonomy_classifications_patterns_gin_idx
  on public.ingredient_taxonomy_classifications
  using gin (digestive_pattern_keys);

drop trigger if exists touch_ingredient_taxonomy_classifications_updated_at
  on public.ingredient_taxonomy_classifications;
create trigger touch_ingredient_taxonomy_classifications_updated_at
before update on public.ingredient_taxonomy_classifications
for each row
execute function public.touch_updated_at();

revoke all on table public.ingredient_taxonomy_classifications from anon, authenticated;
grant select, insert, update on table public.ingredient_taxonomy_classifications to service_role;
