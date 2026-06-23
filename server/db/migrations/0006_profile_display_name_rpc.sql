create or replace function public.update_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.users (id, email)
  select v_user_id, auth.users.email
  from auth.users
  where auth.users.id = v_user_id
  on conflict (id) do update
    set email = coalesce(excluded.email, public.users.email),
        last_seen_at = now();

  insert into public.user_profiles (user_id, display_name)
  values (v_user_id, v_display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  return v_display_name;
end;
$$;

revoke all on function public.update_display_name(text) from public;
revoke all on function public.update_display_name(text) from anon;
grant execute on function public.update_display_name(text) to authenticated;
