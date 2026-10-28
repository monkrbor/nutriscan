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
create policy "backups_insert" on public.backups for insert to authenticated with check (auth.uid() = user_id);
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

-- 7. APRÈS avoir créé ton compte dans l'appli, lance cette ligne pour devenir admin
--    (remplace l'adresse par celle de ton compte) :
-- insert into public.admins (user_id) select id from auth.users where email = 'ton.email@exemple.com';
