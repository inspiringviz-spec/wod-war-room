-- WOD War Room : synchronisation d'équipe
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.
-- Le script peut être relancé sans risque.

create table if not exists public.teams (
  code       text primary key check (char_length(code) between 8 and 64),
  doc        jsonb not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- Aucune politique : la table n'est ni lisible ni modifiable directement avec
-- la clé publique. Tout passe par les deux fonctions ci-dessous, qui exigent
-- le code d'équipe.
alter table public.teams enable row level security;

create or replace function public.get_team(p_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('doc', doc, 'version', version)
  from public.teams
  where code = p_code
$$;

-- p_version = 0 : création. Sinon, mise à jour uniquement si la version n'a
-- pas changé (un autre téléphone n'a pas écrit entre-temps).
create or replace function public.save_team(p_code text, p_doc jsonb, p_version bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  if p_code !~ '^[a-z0-9-]{8,64}$' then
    raise exception 'code d''equipe invalide';
  end if;
  if pg_column_size(p_doc) > 300000 then
    raise exception 'document trop volumineux';
  end if;

  if p_version = 0 then
    insert into public.teams (code, doc)
    values (p_code, p_doc)
    on conflict (code) do nothing
    returning version into v;
  else
    update public.teams
    set doc = p_doc, version = version + 1, updated_at = now()
    where code = p_code and version = p_version
    returning version into v;
  end if;

  if v is null then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'version', v);
end;
$$;

revoke all on function public.get_team(text) from public;
revoke all on function public.save_team(text, jsonb, bigint) from public;
grant execute on function public.get_team(text) to anon, authenticated;
grant execute on function public.save_team(text, jsonb, bigint) to anon, authenticated;
