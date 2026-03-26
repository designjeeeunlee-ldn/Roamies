-- ============================================================
-- Roamies – add trip_photos table
-- Run this in: Supabase dashboard → SQL Editor → New query
-- ============================================================

-- ── 1. trip_photos table ─────────────────────────────────────

create table if not exists public.trip_photos (
  id           uuid default gen_random_uuid() primary key,
  trip_id      uuid references public.trips on delete cascade not null,
  stop_id      uuid references public.stops on delete set null,
  trip_date    date not null,
  uploaded_by  uuid references auth.users on delete set null,
  storage_path text not null,
  created_at   timestamptz default now()
);

alter table public.trip_photos enable row level security;

create policy "Trip members can view photos"
  on public.trip_photos for select
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = trip_photos.trip_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.trips
      where id = trip_photos.trip_id and created_by = auth.uid()
    )
  );

create policy "Trip members can add photos"
  on public.trip_photos for insert
  with check (
    exists (
      select 1 from public.trip_members
      where trip_id = trip_photos.trip_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.trips
      where id = trip_photos.trip_id and created_by = auth.uid()
    )
  );

create policy "Uploader can delete photo"
  on public.trip_photos for delete
  using (auth.uid() = uploaded_by);

-- ── 2. Realtime ───────────────────────────────────────────────

alter publication supabase_realtime add table public.trip_photos;

-- ── 3. Storage bucket (run via Supabase dashboard Storage tab) ─
--
-- Create a bucket named: trip-photos
-- Public bucket: YES  (so image URLs work without auth headers)
-- File size limit: 10 MB
-- Allowed MIME types: image/jpeg, image/png, image/webp, image/heic
--
-- Then add these Storage policies in the dashboard:
--
-- SELECT policy (authenticated read):
--   bucket_id = 'trip-photos' AND auth.role() = 'authenticated'
--
-- INSERT policy (authenticated upload):
--   bucket_id = 'trip-photos' AND auth.role() = 'authenticated'
--
-- DELETE policy (own files only):
--   bucket_id = 'trip-photos'
--   AND auth.uid()::text = (storage.foldername(name))[1]  -- folder = userId
