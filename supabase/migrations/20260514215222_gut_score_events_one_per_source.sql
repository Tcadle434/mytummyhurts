drop index if exists public.gut_score_events_user_source_event_unique_idx;

with ranked_events as (
  select
    id,
    row_number() over (
      partition by user_id, source_type, source_id
      order by created_at desc, id desc
    ) as row_number
  from public.gut_score_events
  where source_type is not null
    and source_id is not null
)
delete from public.gut_score_events event
using ranked_events ranked
where event.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists gut_score_events_user_source_unique_idx
  on public.gut_score_events (user_id, source_type, source_id);
