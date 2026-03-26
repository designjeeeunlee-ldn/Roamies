-- Fix infinite recursion in trip_members RLS policy
-- Run this in Supabase SQL Editor

-- Step 1: helper function that checks membership WITHOUT triggering RLS
-- (security definer = runs as DB owner, bypasses row-level security)
create or replace function public.is_trip_member(trip_uuid uuid)
returns boolean as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = trip_uuid and user_id = auth.uid()
  );
$$ language sql security definer stable;

-- Step 2: replace the recursive policies

-- trip_members: drop old, add simple non-recursive version
drop policy if exists "Trip members can view membership" on public.trip_members;
create policy "Trip members can view membership"
  on public.trip_members for select
  using (public.is_trip_member(trip_id) or auth.uid() = user_id);

-- trips: use helper instead of subquery
drop policy if exists "Trip members can view trips" on public.trips;
create policy "Trip members can view trips"
  on public.trips for select
  using (auth.uid() = created_by or public.is_trip_member(id));

-- stops: use helper
drop policy if exists "Trip members can view stops" on public.stops;
create policy "Trip members can view stops"
  on public.stops for select
  using (public.is_trip_member(trip_id) or exists (
    select 1 from public.trips where id = stops.trip_id and created_by = auth.uid()
  ));

drop policy if exists "Trip members can add stops" on public.stops;
create policy "Trip members can add stops"
  on public.stops for insert
  with check (public.is_trip_member(trip_id) or exists (
    select 1 from public.trips where id = stops.trip_id and created_by = auth.uid()
  ));

-- expenses: use helper
drop policy if exists "Trip members can view expenses" on public.expenses;
create policy "Trip members can view expenses"
  on public.expenses for select
  using (public.is_trip_member(trip_id) or exists (
    select 1 from public.trips where id = expenses.trip_id and created_by = auth.uid()
  ));

drop policy if exists "Trip members can add expenses" on public.expenses;
create policy "Trip members can add expenses"
  on public.expenses for insert
  with check (public.is_trip_member(trip_id) or exists (
    select 1 from public.trips where id = expenses.trip_id and created_by = auth.uid()
  ));

-- profiles: use helper
drop policy if exists "Trip members can view other profiles" on public.profiles;
create policy "Trip members can view other profiles"
  on public.profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1 from public.trip_members tm
      where tm.user_id = profiles.id and public.is_trip_member(tm.trip_id)
    )
  );
