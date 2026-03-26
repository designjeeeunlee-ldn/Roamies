-- ============================================================
-- Roamies – Supabase schema  (replaces old waypoint schema)
-- Run this in: Supabase dashboard → SQL Editor → New query
-- ============================================================

-- ── 0. Drop old tables (old schema used text IDs — must clear first) ──

drop table if exists public.notes          cascade;
drop table if exists public.photos         cascade;
drop table if exists public.ai_conversations cascade;
drop table if exists public.ai_flags       cascade;
drop table if exists public.stops          cascade;
drop table if exists public.days           cascade;
drop table if exists public.members        cascade;
drop table if exists public.trips          cascade;
drop table if exists public.trip_members   cascade;
drop table if exists public.expenses       cascade;
drop table if exists public.profiles       cascade;

-- ── 1. Profiles (extends auth.users) ─────────────────────────

create table if not exists public.profiles (
  id            uuid references auth.users on delete cascade primary key,
  display_name  text,
  handle        text unique,
  location      text,
  travel_status text default 'explorer'
                check (travel_status in ('on_trip','planning','explorer','home')),
  avatar_url    text,
  updated_at    timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ── 2. Trips ─────────────────────────────────────────────────

create table if not exists public.trips (
  id           uuid default gen_random_uuid() primary key,
  name         text not null,
  dates_label  text,
  accent_color text default '#6B3FA0',
  created_by   uuid references auth.users not null,
  is_active    boolean default true,
  created_at   timestamptz default now()
);

alter table public.trips enable row level security;

create policy "Authenticated users can create trips"
  on public.trips for insert with check (auth.uid() = created_by);

create policy "Trip creator can update"
  on public.trips for update using (auth.uid() = created_by);

-- ── 3. Trip members ──────────────────────────────────────────

create table if not exists public.trip_members (
  trip_id       uuid references public.trips on delete cascade,
  user_id       uuid references auth.users on delete cascade,
  role          text default 'planner'
                check (role in ('planner','contributor')),
  display_color text default '#6B3FA0',
  joined_at     timestamptz default now(),
  primary key (trip_id, user_id)
);

alter table public.trip_members enable row level security;

create policy "Trip members can view membership"
  on public.trip_members for select
  using (
    exists (
      select 1 from public.trip_members tm
      where tm.trip_id = trip_members.trip_id and tm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.trips
      where id = trip_members.trip_id and created_by = auth.uid()
    )
  );

create policy "Creator or self can join"
  on public.trip_members for insert
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.trips
      where id = trip_id and created_by = auth.uid()
    )
  );

-- Trips: members can view (needs trip_members to exist first)
create policy "Trip members can view trips"
  on public.trips for select
  using (
    auth.uid() = created_by
    or exists (
      select 1 from public.trip_members
      where trip_id = trips.id and user_id = auth.uid()
    )
  );

-- Profiles: trip members can see each other
create policy "Trip members can view other profiles"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.trip_members tm1
      join public.trip_members tm2 on tm1.trip_id = tm2.trip_id
      where tm1.user_id = auth.uid()
        and tm2.user_id = profiles.id
    )
  );

-- ── 4. Stops ─────────────────────────────────────────────────

create table if not exists public.stops (
  id               uuid default gen_random_uuid() primary key,
  trip_id          uuid references public.trips on delete cascade not null,
  trip_date        date not null,
  place_name       text not null,
  stop_time        text,
  category         text default 'sight',
  description      text,
  duration_minutes integer default 60,
  cost             text,
  origin           text default 'user_added',
  pet_friendly     boolean default false,
  created_by       uuid references auth.users,
  created_at       timestamptz default now()
);

alter table public.stops enable row level security;

create policy "Trip members can view stops"
  on public.stops for select
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = stops.trip_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.trips
      where id = stops.trip_id and created_by = auth.uid()
    )
  );

create policy "Trip members can add stops"
  on public.stops for insert
  with check (
    exists (
      select 1 from public.trip_members
      where trip_id = stops.trip_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.trips
      where id = stops.trip_id and created_by = auth.uid()
    )
  );

create policy "Stop creator can update"
  on public.stops for update using (auth.uid() = created_by);

create policy "Stop creator can delete"
  on public.stops for delete using (auth.uid() = created_by);

-- ── 5. Expenses ──────────────────────────────────────────────

create table if not exists public.expenses (
  id           uuid default gen_random_uuid() primary key,
  trip_id      uuid references public.trips on delete cascade not null,
  title        text not null,
  amount_chf   numeric(10,2) not null,
  paid_by      uuid references auth.users not null,
  split_with   uuid[] not null default '{}',
  category     text default 'other'
               check (category in ('food','transport','accommodation','activity','other')),
  expense_date text,
  created_at   timestamptz default now()
);

alter table public.expenses enable row level security;

create policy "Trip members can view expenses"
  on public.expenses for select
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = expenses.trip_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.trips
      where id = expenses.trip_id and created_by = auth.uid()
    )
  );

create policy "Trip members can add expenses"
  on public.expenses for insert
  with check (
    exists (
      select 1 from public.trip_members
      where trip_id = expenses.trip_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.trips
      where id = expenses.trip_id and created_by = auth.uid()
    )
  );

create policy "Expense payer can update"
  on public.expenses for update using (auth.uid() = paid_by);

create policy "Expense payer can delete"
  on public.expenses for delete using (auth.uid() = paid_by);

-- ── 6. Auto-create profile on sign-up ────────────────────────

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 7. Enable realtime for live collab ───────────────────────

alter publication supabase_realtime add table public.stops;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.trip_members;
