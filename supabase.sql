-- NutriScan : base de données des sauvegardes (à coller dans Supabase → SQL Editor → Run)
-- Chaque utilisateur ne voit que SA sauvegarde. Les comptes listés dans "admins" voient tout.

-- 1. Sauvegarde actuelle de chaque utilisateur
create table if not exists public.backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  data jsonb not null,
  entries_count int not null default 0,
  device text,
  consent_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 2. Anciennes versions (une toutes les 6 h maximum, 30 gardées par utilisateur)
create table if not exists public.backup_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  entries_count int not null default 0,
  saved_at timestamptz not null default now()
);
create index if not exists backup_history_user on public.backup_history (user_id, saved_at desc);

-- 3. Administrateurs
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- 4. Sécurité (Row Level Security)
alter table public.backups enable row level security;
alter table public.backup_history enable row level security;
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

drop policy if exists "backups_select" on public.backups;
drop policy if exists "backups_insert" on public.backups;
drop policy if exists "backups_update" on public.backups;
drop policy if exists "backups_delete" on public.backups;
create policy "backups_select" on public.backups for select to authenticated using (auth.uid() = user_id or public.is_admin());
create policy "backups_insert" on public.backups for insert to authenticated with check (auth.uid() = user_id or public.is_admin());
create policy "backups_update" on public.backups for update to authenticated using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
create policy "backups_delete" on public.backups for delete to authenticated using (auth.uid() = user_id or public.is_admin());

drop policy if exists "history_select" on public.backup_history;
create policy "history_select" on public.backup_history for select to authenticated using (auth.uid() = user_id or public.is_admin());

drop policy if exists "admins_select" on public.admins;
create policy "admins_select" on public.admins for select to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.backups to authenticated;
grant select on public.backup_history to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 5. Historique automatique avant chaque modification
create or replace function public.keep_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.data is distinct from new.data and
     now() - coalesce((select max(saved_at) from public.backup_history where user_id = old.user_id), 'epoch'::timestamptz) > interval '6 hours' then
    insert into public.backup_history (user_id, data, entries_count) values (old.user_id, old.data, old.entries_count);
    delete from public.backup_history where user_id = old.user_id and id not in (
      select id from public.backup_history where user_id = old.user_id order by saved_at desc limit 30);
  end if;
  return new;
end $$;
drop trigger if exists backups_history on public.backups;
create trigger backups_history before update on public.backups for each row execute function public.keep_history();

-- 6. Suppression de son propre compte (droit à l'effacement, RGPD)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 7. Suivi de l'appli (seulement pour les utilisateurs qui ont accepté) : erreurs, scans, ouvertures…
create table if not exists public.events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  device text not null,
  type text not null,
  data jsonb,
  version text,
  ua text,
  constraint events_small check (octet_length(coalesce(data::text, '')) < 4000 and length(type) < 40 and length(device) < 80)
);
create index if not exists events_created on public.events (created_at desc);
create index if not exists events_user on public.events (user_id, created_at desc);
create index if not exists events_type on public.events (type, created_at desc);
alter table public.events enable row level security;
drop policy if exists "events_insert" on public.events;
drop policy if exists "events_select" on public.events;
drop policy if exists "events_delete" on public.events;
create policy "events_insert" on public.events for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
create policy "events_select" on public.events for select to authenticated using (public.is_admin());
create policy "events_delete" on public.events for delete to authenticated using (public.is_admin());
grant insert on public.events to anon, authenticated;
grant usage, select on sequence public.events_id_seq to anon, authenticated;
grant select, delete on public.events to authenticated;

-- 8. Notes de l'admin sur chaque utilisateur
create table if not exists public.user_admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  flagged boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_admin enable row level security;
drop policy if exists "user_admin_all" on public.user_admin;
create policy "user_admin_all" on public.user_admin for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.user_admin to authenticated;

-- 9. Messages de l'admin (à un utilisateur, ou à tous si user_id est vide)
create table if not exists public.messages (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.message_reads (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
drop policy if exists "messages_select" on public.messages;
drop policy if exists "messages_admin" on public.messages;
drop policy if exists "reads_own" on public.message_reads;
drop policy if exists "reads_admin" on public.message_reads;
create policy "messages_select" on public.messages for select to authenticated using (user_id is null or user_id = auth.uid() or public.is_admin());
create policy "messages_admin" on public.messages for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "reads_own" on public.message_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reads_admin" on public.message_reads for select to authenticated using (public.is_admin());
grant select, insert, update, delete on public.messages to authenticated;
grant usage, select on sequence public.messages_id_seq to authenticated;
grant select, insert, delete on public.message_reads to authenticated;

-- 10. Gestion des comptes par l'admin
-- Liste des comptes avec un résumé de leur progression (jours suivis, poids de départ et actuel, objectif)
create or replace function public.ns_num(v text) returns numeric
language sql immutable as $$ select case when v ~ '^-?[0-9]+(\.[0-9]+)?$' then v::numeric end $$;
drop function if exists public.admin_users();
create function public.admin_users()
returns table (id uuid, email text, provider text, created_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz,
               name text, entries_count int, updated_at timestamptz, consent_at timestamptz, note text, flagged boolean,
               days_tracked int, last_day text, first_kg numeric, last_kg numeric, goal_kg numeric, goal text, kcal_goal numeric, data_size int)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Accès réservé à l''administrateur'; end if;
  return query
    select u.id, u.email::text, coalesce(u.raw_app_meta_data->>'provider', 'email')::text, u.created_at, u.last_sign_in_at, u.banned_until,
           b.name, b.entries_count, b.updated_at, b.consent_at, a.note, coalesce(a.flagged, false),
           (select count(distinct e->>'date')::int from jsonb_array_elements(case when jsonb_typeof(b.data->'entries') = 'array' then b.data->'entries' else '[]'::jsonb end) e),
           (select max(e->>'date') from jsonb_array_elements(case when jsonb_typeof(b.data->'entries') = 'array' then b.data->'entries' else '[]'::jsonb end) e),
           public.ns_num(b.data->'weights'->0->>'kg'), public.ns_num(b.data->'weights'->-1->>'kg'),
           public.ns_num(b.data->'profile'->>'goalWeight'), (b.data->'profile'->>'goal')::text, public.ns_num(b.data->'goals'->>'kcal'),
           octet_length(b.data::text)
    from auth.users u
    left join public.backups b on b.user_id = u.id
    left join public.user_admin a on a.user_id = u.id
    order by coalesce(b.updated_at, u.last_sign_in_at, u.created_at) desc;
end $$;

create or replace function public.admin_set_ban(target uuid, ban boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Accès réservé à l''administrateur'; end if;
  if target = auth.uid() then raise exception 'Tu ne peux pas bloquer ton propre compte'; end if;
  -- même durée que le blocage de Supabase (100 ans) : une date infinie n'est pas lue par le service de connexion
  update auth.users set banned_until = case when ban then now() + interval '100 years' else null end where id = target;
end $$;

create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Accès réservé à l''administrateur'; end if;
  if target = auth.uid() then raise exception 'Tu ne peux pas supprimer ton propre compte d''ici'; end if;
  delete from auth.users where id = target;
end $$;

revoke all on function public.admin_users() from public, anon;
revoke all on function public.admin_set_ban(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- 11. Nettoyage automatique : le suivi de plus de 180 jours est effacé de temps en temps
create or replace function public.events_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if random() < 0.01 then delete from public.events where created_at < now() - interval '180 days'; end if;
  return null;
end $$;
drop trigger if exists events_cleanup on public.events;
create trigger events_cleanup after insert on public.events for each statement execute function public.events_cleanup();

-- 12. APRÈS avoir créé ton compte dans l'appli, lance cette ligne pour devenir admin
--    (remplace l'adresse par celle de ton compte) :
-- insert into public.admins (user_id) select id from auth.users where email = 'ton.email@exemple.com';
