# Waypoint — product brief
*Read this at the start of every Claude Code session before writing any code.*

---

## What this app is

Waypoint is a mobile-native travel planning and memory app. The core idea: one shared living document that a group of friends or family co-create before, during, and after a trip. It combines a minimal day-by-day itinerary, a real-time group map, an AI co-planner, and a collaborative photo layer.

The product sits in a gap no current app fills: Wanderlog has group planning but weak AI and no memory layer. TripIt has organisation but no collaboration. Mindtrip has AI but no documentation. Waypoint does all three.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Mobile framework | React Native + Expo | One codebase for iOS + Android. Expo removes setup friction. |
| Navigation | Expo Router | File-based routing — each screen is a file. |
| Backend + database | Supabase | Free tier. Handles auth, real-time sync, file storage, edge functions. |
| Maps | Mapbox SDK | Better styling control, generous free tier. |
| AI | Anthropic Claude API | Called from a Supabase Edge Function — API key never ships in the app. |
| Photo access | Expo Media Library | Native camera roll access with EXIF GPS + timestamp. |

---

## Five screens — tab navigation

### 1. Today (default tab)
Flashcard-style view of the current day's stops. One card visible at a time, with a stacked shadow hint of cards below. Swipe right to confirm, swipe left to skip — or use the two action buttons at the bottom of each card.

**Each flashcard shows:**
- Time + category label (e.g. "12:30 · Lunch")
- Place name (large, 14–16px, the dominant element)
- One-line description
- Tags: open/closed status, duration, cost indicator, dog-friendly if relevant
- A small trust pill: "4.4 ★ · verified ›" — tapping opens the source drawer
- Two actions: Skip / Confirm

**Day strip at top:** scrollable pill row showing each day of the trip. Active day is filled purple. Done days are muted. Tapping jumps to that day's cards.

**TBD days:** when a day has unresolved decisions, show group decision cards instead of flashcards — voting interface with options and current vote counts.

---

### 2. Map (treasure hunt view)
Full-screen map. Each group member appears as a coloured dot with their initials. Photo clusters appear as amber pins with a count badge. Planned stops appear as small white cards anchored to the map.

**Persistent strip at bottom:** "Next up — [stop name] · [distance] · [walk time]"

**Live badge top-left:** green dot + "Live · N nearby"

**Legend bottom of map:** colour key for each member + photo pins + planned stops

Location sharing is always opt-in per trip. A persistent "You're sharing location" indicator with a one-tap off button is always visible when sharing is active.

---

### 3. AI co-planner
Conversational chat interface. The AI has full trip context injected into every message — it knows the current itinerary, confirmed stops, skipped stops, group members, dates, and pet status.

**Source transparency:**
- Every recommendation includes inline footnote-style tags: e.g. "rated highly by locals [Tabelog] and confirmed open today [Google]"
- Tapping a tag opens a source detail card showing: source name, score, review count, last updated, sponsored: false
- A small persistent note at top of screen: "Sources: Google Maps · Tabelog · Timeout · local news. No paid results."

**Proactive flags:** the AI surfaces issues it finds without being asked — closed venues, seasonal access restrictions, better alternatives to things on the plan.

---

### 4. Photos
Collaborative gallery of all trip photos from all group members. Each photo is tagged with a small avatar of who took it.

**Photo sync model:**
1. Camera roll syncs in background using EXIF GPS + timestamp to auto-match photos to trip days and stops
2. Synced photos are private to the individual by default — only they see them
3. One-tap to share with the group
4. Nothing uploads to the server until the user explicitly shares

**Two sub-views:**
- Gallery grid (default) — all shared photos in chronological order
- Map view — photos placed as pins on the trip map by GPS location

---

### 5. Group
- Member list with avatars, roles, and location-sharing status
- Voting cards for unresolved TBD decisions
- Group notes — freeform notes any member can add, visible to all
- Trip settings (name, dates, pet toggle, share link)

---

## Data model

### Trip
```
id
name              — "Strasbourg → Switzerland"
start_date        — 2025-04-02
end_date          — 2025-04-07
destinations      — ["Strasbourg", "Schaffhausen", "Lucerne", "Interlaken"]
status            — planning | active | past
created_by        — member id
share_link        — unique URL slug
pet               — { enabled: true, name: "Cali" }
```

### Member (belongs to Trip)
```
id
trip_id
name              — "Jee Eun"
role              — planner | contributor | viewer
colour            — hex, shown on map and avatar
joined_via        — invite_link | direct
location_sharing  — off | during_trip | app_open
photo_sync        — true | false
```
*Note: all consent fields are per-trip, not global. Changing one trip does not affect others.*

### Day (belongs to Trip)
```
id
trip_id
date              — 2025-04-05
day_number        — 2
title             — "Rhine Falls + Schaffhausen"
status            — upcoming | active | done
```

### Stop (belongs to Day)
```
id
day_id
time              — "14:00"
place_name        — "Rhine Falls"
coordinates       — { lat, lng }
category          — food | sight | travel | hotel | free | spa | wine
duration_minutes  — 60
description       — one line, shown on flashcard
origin            — ai_suggested | user_added
state             — suggested | confirmed | skipped | done
hours_today       — open | closed | unknown   (fetched live from Google Places)
pet_friendly      — true | false | unknown
sources           — array of source objects (see below)
notes             — freeform string
```

### Source (attached to Stop)
```
name              — "Google Maps"
score             — 4.6
review_count      — 2341
last_updated      — "3 days ago"
note              — "Local guide verified"
sponsored         — false   ← always false; sponsored results are filtered before reaching the AI
```

### Photo (belongs to Day, optionally linked to Stop)
```
id
day_id
stop_id           — nullable, auto-matched by GPS proximity + timestamp
taken_at          — timestamp from EXIF
coordinates       — GPS from EXIF
taken_by          — member id
visibility        — private | shared
caption           — nullable string
file_url          — only set after user shares
```

### Note (belongs to Day)
```
id
day_id
stop_id           — nullable
text              — "Gion very crowded on weekends"
added_by          — member id
added_at          — timestamp
```

### AI Conversation (belongs to Trip)
```
id
trip_id
messages          — array of { role: user|assistant, content, timestamp }
pending_suggestions — AI proposals not yet confirmed by group
```

---

## Stop states — how a stop moves through the app

| State | Meaning | UI treatment |
|---|---|---|
| suggested | AI proposed it, not yet confirmed | Lighter style on flashcard, purple "AI" badge |
| confirmed | A member tapped Confirm | Full style, shown on map, in timeline |
| skipped | A member swiped Skip | Hidden from day view, kept in history. AI learns not to re-suggest. |
| done | Time has passed, trip has moved on | Archived in memory layer, photos auto-attach |

---

## AI pipeline — how recommendations are built

The AI never free-generates place names. It only reasons about real entities returned from verified APIs.

**Order of operations:**
1. **Query construction** — user intent + trip context → structured queries to Google Places API, Tabelog, Reddit (last 90 days)
2. **Sponsored filter** — strip any result with `sponsored: true` or `featured_listing: true` from source API. Runs before the LLM sees results. Hard exclude, no override.
3. **Trust scoring** — rank candidates by: local review volume (35%), recency of reviews (25%), editorial mentions (25%), cross-source agreement (15%)
4. **Hallucination guard** — system prompt constrains the LLM to only reference places in the verified candidate set. If no verified result exists, it must say so.
5. **Citation attachment** — source metadata attached to each recommendation at pipeline time, not inferred after

**Sources used:**
- Tier 1 (trusted): Google Places API (facts only), Tabelog (local reviews), Timeout / Condé Nast editorial (non-sponsored)
- Tier 2 (signal): Local news RSS feeds, Reddit trip reports (last 90 days)
- Hard blocked: Google Ads placements, TripAdvisor sponsored slots, Booking.com featured, any `sponsored: true` API flag

**Real-time refresh:**
- Opening hours: live per query (Google Places)
- Local news + closures: every 6 hours
- Review scores: daily cache
- Weather + seasonal: every 3 hours (Open-Meteo API, free)
- Flight status: live push (AviationStack API)

---

## Location sharing — consent rules

- Consent prompt shown when joining each trip — never carried over from a previous trip
- Three options: "During trip dates only" (default, recommended), "Only while app is open", "Off"
- "During trip dates only" auto-expires at `trip.end_date` — no action needed from user
- A persistent on-screen indicator always shows when sharing is active, with one-tap off
- Declining or saying "off" still allows the user to use all other features — map still works, they just appear as offline to the group

---

## Photo sync — privacy rules

- Access prompt: "Allow Waypoint to access your photos to sync your trip automatically"
- Sync reads EXIF GPS + timestamp only — matches photos to the trip by date range and location
- Synced photos are private by default — only the owner sees them in their own view
- Sharing with the group is an explicit one-tap action, per photo or batch
- Nothing is uploaded to Supabase storage until the user shares
- "Private → Shared" is one-way — once shared, it stays shared unless the user deletes it

---

## Invite and roles

| Role | Can do |
|---|---|
| Planner | Edit itinerary, add/remove stops, invite others, change trip settings |
| Contributor | Add photos, add notes, vote on TBDs, view full itinerary |
| Viewer | Read-only — see itinerary, map, gallery. No editing. |

- Invite via link (no app required to view) or direct contact
- Link-based invite lands on a web preview of the trip with key highlights
- Location consent and role assignment happen at join time
- "View plan first" option before accepting lets invitees browse without committing

---

## Test data — Switzerland trip

Use this seed data throughout development. Load it via a `seed.ts` file.

**Trip:** Strasbourg → Switzerland · Thu 2 Apr – Tue 7 Apr 2026

**Members:**
- Jee Eun (planner, purple, London)
- Ben (planner, green, London — travelling with Jee Eun)
- Eliška (planner, coral, Prague — wrote the original plan)
- David (contributor, amber, Prague — travelling with Eliška)
- Cali (dog 🐕 — pet flag on trip)

**Days and confirmed stops:**

*Thu Apr 2 — Travel day*
- Jee Eun + Ben: London → Strasbourg
- Eliška + David + Cali: Prague → Strasbourg
- Hotel: accommodation near Strasbourg (booked by Jee Eun, cancellable until Apr 1)

*Fri Apr 3 — Strasbourg + Rhine Falls*
- Morning: Strasbourg old town walk + brunch
- Afternoon: Drive to Schaffhausen / Neuhausen area
- Rhine Falls — circular path walk (~1 hr, dog friendly, free)
- Evening: Wine — TBD (Marcus Ruch / Weingut Besson Strasser / Weingut Lenz — all contacted)
- Sleep: Schaffhausen area OR drive to Lucerne (decision pending)
- Hotel option: Vienna House by Wyndham Zur Bleiche Schaffhausen — 130 CHF/room + 20 CHF pet fee

*Sat Apr 4 — Hot springs → Lucerne*
- Hot spring stop en route — TBD from shortlist:
  - Therme Zurzach ← AI recommended (4.5★, pet-friendly outdoor area, ~40 min detour)
  - Bad Schinznach ← CLOSED, renovation Mar 2026, remove from suggestions
  - Ennetbaden "Heisse Brunnen"
  - FORTYSEVEN Baden
- Lucerne visit
- TBD nature activity (Fronalpstock / Stoos — check seasonal accessibility)
- Drive to Interlaken in evening, OR night in Lucerne if wine found

*Sun Apr 5 — Interlaken area*
- Drive to Interlaken (or already there)
- Group vote open for main activity:
  - Lauterbrunnen valley ← best pick for early April (lower altitude, confirmed accessible)
  - Iseltwald village + Lake Brienz ← good scenic lakeside walking
  - Grindelwald ← accessible but quieter in April
  - Wengen ← Männlichen operating through 6 April, winter hike available
  - Rosenlaui Valley ← CLOSED until 14 May 2026, remove from suggestions
  - Bachalpsee ← accessible hike to a lake
- Spa option: Bodeli Bad (verify) or Thermalquellen-Weg
- Night: Interlaken or nearby (Iseltwald cheaper option)

*Mon Apr 6 — Final day before split*
- TBD: Rosenlaui (closed — remove), Grindelwald, Bachalpsee
- Jee Eun + Ben: start driving back toward France
- Eliška + David: start returning to Prague (possibly Mon night or Tue)

*Tue Apr 7 — Return*
- Jee Eun + Ben arrive London
- Eliška + David arrive Prague

**AI flags to surface proactively:**
1. Rosenlaui Valley closed until 14 May 2026 — remove from Sun 5 + Mon 6
2. Bad Schinznach hot spring under renovation as of Mar 2026 — remove from Sat 4
3. Therme Zurzach is the recommended hot spring (4.5★ Google, 2,100+ reviews, pet-friendly outdoor area, 40 min detour on Schaffhausen → Lucerne route)
4. Marcus Ruch is the recommended wine producer contact (most reviewed locally)
5. Vienna House pet fee is 20 CHF on top of 130 CHF/room — flag when showing accommodation

---

## Build order

### Phase 1 — Foundation (get something running on device)
1. Expo + Expo Router scaffold
2. Supabase project + Trip data model + seed file with Switzerland data
3. Tab navigation: 5 tabs with correct labels and icons
4. Today tab: flashcard component with the Switzerland Day 3 data
5. Swipe interaction (confirm / skip)

### Phase 2 — Collaboration
6. Auth: sign up, sign in, invite link flow
7. Real-time sync via Supabase Realtime
8. Map tab: static map with member dots + stop pins
9. Group tab: member list + voting cards for TBD decisions

### Phase 3 — Intelligence
10. AI co-planner: chat UI + Claude API via Supabase Edge Function
11. Plan import: paste text → AI parses → review screen
12. Camera roll sync: Expo Media Library + EXIF matching
13. Source pipeline: Google Places API + sponsored filter + trust scoring
14. Source drawer UI on flashcard trust pill

---

## Design principles

- **Minimal by default.** The flashcard shows one stop. The map shows one layer at a time. Nothing competes for attention.
- **Honest AI.** The co-planner cites sources, flags issues proactively, and says "I don't have verified data on that" rather than guessing.
- **Private until shared.** Photos, location — everything defaults to private. The user explicitly shares.
- **Per-trip consent.** Location sharing, roles, and preferences are set per trip. Nothing carries over globally.
- **Dog-friendly awareness.** Pet status is a trip-level flag that pre-filters all AI suggestions, accommodation searches, and activity recommendations.

---

*Last updated: based on full design session with Jee Eun. App name: Waypoint (working title).*
