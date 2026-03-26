-- MAGAZZINO ASSOFRUTTI — Schema Database
-- Esegui TUTTO in Supabase > SQL Editor > New Query > Run

create table if not exists lotti (
  id bigint generated always as identity primary key,
  sett_prod int, anno int,
  imballo text not null, lotto text not null,
  desc1 text not null default 'CONVENZIONALI',
  desc2 text not null default 'SGUSCIATE',
  desc3 text not null default '9/11',
  q_iniz numeric not null default 0,
  mov numeric not null default 0,
  magazzino text not null default 'Fabrica',
  mv numeric default 0, mo numeric default 0,
  cv numeric default 0, co numeric default 0, ce numeric default 0,
  contratto text default '', acquirente text default '',
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists contratti (
  id text primary key,
  desc1 text not null default 'CONVENZIONALI',
  desc2 text not null default 'SGUSCIATE',
  desc3 text not null default '9/11',
  cliente text not null, scadenza date,
  qta_tot numeric not null default 0,
  qta_evasa numeric not null default 0,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists movimenti (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('ENTRATA','USCITA','TRASFERIMENTO')),
  data date not null default current_date,
  imballo text not null, lotto text not null,
  desc1 text not null, desc2 text not null, desc3 text not null,
  qta numeric not null, magazzino text not null,
  contratto_id text default '',
  created_at timestamptz default now()
);

create table if not exists user_profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null, nome text not null default '',
  ruolo text not null default 'operatore' check (ruolo in ('admin','operatore')),
  created_at timestamptz default now()
);

create index if not exists idx_lotti_lotto on lotti(lotto);
create index if not exists idx_lotti_contratto on lotti(contratto);
create index if not exists idx_movimenti_data on movimenti(data);
create index if not exists idx_contratti_cliente on contratti(cliente);

create or replace function update_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists lotti_updated on lotti;
create trigger lotti_updated before update on lotti for each row execute function update_updated_at();
drop trigger if exists contratti_updated on contratti;
create trigger contratti_updated before update on contratti for each row execute function update_updated_at();

create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.user_profiles (id, email, nome, ruolo)
  values (new.id, new.email, '', 'operatore')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

alter table lotti enable row level security;
alter table contratti enable row level security;
alter table movimenti enable row level security;
alter table user_profiles enable row level security;

drop policy if exists "lotti_all" on lotti;
create policy "lotti_all" on lotti for all using (true) with check (true);
drop policy if exists "contratti_all" on contratti;
create policy "contratti_all" on contratti for all using (true) with check (true);
drop policy if exists "movimenti_all" on movimenti;
create policy "movimenti_all" on movimenti for all using (true) with check (true);
drop policy if exists "profiles_all" on user_profiles;
create policy "profiles_all" on user_profiles for all using (true) with check (true);
