/**
 * seed.ts — Switzerland trip test data
 * Run with: npx ts-node seed.ts  (requires EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY in .env)
 *
 * Covers: Trip → Members → Days → Stops (with sources)
 * All IDs are stable UUIDs so the seed is idempotent (upsert).
 */

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

const TRIP_ID = 'trip-switzerland-2026';

const MEMBER = {
  jeeEun: 'member-jee-eun',
  ben: 'member-ben',
  eliska: 'member-eliska',
  david: 'member-david',
};

const DAY = {
  apr2: 'day-apr-2',
  apr3: 'day-apr-3',
  apr4: 'day-apr-4',
  apr5: 'day-apr-5',
  apr6: 'day-apr-6',
  apr7: 'day-apr-7',
};

// ---------------------------------------------------------------------------
// Trip
// ---------------------------------------------------------------------------

const trip = {
  id: TRIP_ID,
  name: 'Strasbourg → Switzerland',
  start_date: '2026-04-02',
  end_date: '2026-04-07',
  destinations: ['Strasbourg', 'Schaffhausen', 'Lucerne', 'Interlaken'],
  status: 'planning',
  created_by: MEMBER.jeeEun,
  share_link: 'waypoint-switzerland-2026',
  pet: { enabled: true, name: 'Cali' },
};

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

const members = [
  {
    id: MEMBER.jeeEun,
    trip_id: TRIP_ID,
    name: 'Jee Eun',
    role: 'planner',
    colour: '#7C3AED',
    joined_via: 'direct',
    location_sharing: 'during_trip',
    photo_sync: true,
  },
  {
    id: MEMBER.ben,
    trip_id: TRIP_ID,
    name: 'Ben',
    role: 'planner',
    colour: '#16A34A',
    joined_via: 'direct',
    location_sharing: 'during_trip',
    photo_sync: true,
  },
  {
    id: MEMBER.eliska,
    trip_id: TRIP_ID,
    name: 'Eliška',
    role: 'planner',
    colour: '#F97316',
    joined_via: 'invite_link',
    location_sharing: 'during_trip',
    photo_sync: true,
  },
  {
    id: MEMBER.david,
    trip_id: TRIP_ID,
    name: 'David',
    role: 'contributor',
    colour: '#F59E0B',
    joined_via: 'invite_link',
    location_sharing: 'app_open',
    photo_sync: false,
  },
];

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

const days = [
  {
    id: DAY.apr2,
    trip_id: TRIP_ID,
    date: '2026-04-02',
    day_number: 1,
    title: 'Travel day',
    status: 'upcoming',
  },
  {
    id: DAY.apr3,
    trip_id: TRIP_ID,
    date: '2026-04-03',
    day_number: 2,
    title: 'Strasbourg + Rhine Falls',
    status: 'upcoming',
  },
  {
    id: DAY.apr4,
    trip_id: TRIP_ID,
    date: '2026-04-04',
    day_number: 3,
    title: 'Hot springs → Lucerne',
    status: 'upcoming',
  },
  {
    id: DAY.apr5,
    trip_id: TRIP_ID,
    date: '2026-04-05',
    day_number: 4,
    title: 'Interlaken area',
    status: 'upcoming',
  },
  {
    id: DAY.apr6,
    trip_id: TRIP_ID,
    date: '2026-04-06',
    day_number: 5,
    title: 'Final day before split',
    status: 'upcoming',
  },
  {
    id: DAY.apr7,
    trip_id: TRIP_ID,
    date: '2026-04-07',
    day_number: 6,
    title: 'Return day',
    status: 'upcoming',
  },
];

// ---------------------------------------------------------------------------
// Stops
// ---------------------------------------------------------------------------

const stops = [
  // --- Day 1: Travel ---
  {
    id: 'stop-london-strasbourg',
    day_id: DAY.apr2,
    time: '09:00',
    place_name: 'London → Strasbourg',
    coordinates: null,
    category: 'travel',
    duration_minutes: 480,
    description: 'Jee Eun + Ben travel from London to Strasbourg',
    origin: 'user_added',
    state: 'confirmed',
    hours_today: 'unknown',
    pet_friendly: false,
    sources: [],
    notes: 'Hotel booked by Jee Eun — cancellable until 1 Apr',
  },
  {
    id: 'stop-prague-strasbourg',
    day_id: DAY.apr2,
    time: '09:00',
    place_name: 'Prague → Strasbourg',
    coordinates: null,
    category: 'travel',
    duration_minutes: 600,
    description: 'Eliška + David + Cali travel from Prague to Strasbourg',
    origin: 'user_added',
    state: 'confirmed',
    hours_today: 'unknown',
    pet_friendly: true,
    sources: [],
    notes: null,
  },

  // --- Day 2: Strasbourg + Rhine Falls ---
  {
    id: 'stop-strasbourg-old-town',
    day_id: DAY.apr3,
    time: '09:30',
    place_name: 'Strasbourg old town walk',
    coordinates: { lat: 48.5734, lng: 7.7521 },
    category: 'sight',
    duration_minutes: 90,
    description: 'Morning walk through Petite France and the cathedral quarter',
    origin: 'user_added',
    state: 'confirmed',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.7,
        review_count: 12400,
        last_updated: '1 week ago',
        note: null,
        sponsored: false,
      },
    ],
    notes: null,
  },
  {
    id: 'stop-strasbourg-brunch',
    day_id: DAY.apr3,
    time: '11:00',
    place_name: 'Brunch — Strasbourg',
    coordinates: { lat: 48.5734, lng: 7.7521 },
    category: 'food',
    duration_minutes: 60,
    description: 'Brunch before driving to Schaffhausen',
    origin: 'user_added',
    state: 'suggested',
    hours_today: 'unknown',
    pet_friendly: false,
    sources: [],
    notes: 'Place TBD',
  },
  {
    id: 'stop-rhine-falls',
    day_id: DAY.apr3,
    time: '14:30',
    place_name: 'Rhine Falls',
    coordinates: { lat: 47.6779, lng: 8.6158 },
    category: 'sight',
    duration_minutes: 60,
    description: 'Circular path walk around Europe\'s largest waterfall',
    origin: 'user_added',
    state: 'confirmed',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.6,
        review_count: 34200,
        last_updated: '2 days ago',
        note: 'Dog-friendly circular path, free entry',
        sponsored: false,
      },
    ],
    notes: 'Free. ~1 hr circular walk. Dog friendly.',
  },
  {
    id: 'stop-wine-marcus-ruch',
    day_id: DAY.apr3,
    time: '18:00',
    place_name: 'Marcus Ruch Weingut',
    coordinates: { lat: 47.6900, lng: 8.6350 },
    category: 'wine',
    duration_minutes: 120,
    description: 'Local winery — most reviewed in the area',
    origin: 'ai_suggested',
    state: 'suggested',
    hours_today: 'unknown',
    pet_friendly: false,
    sources: [
      {
        name: 'Google Maps',
        score: 4.5,
        review_count: 380,
        last_updated: '5 days ago',
        note: 'Most reviewed local producer in Schaffhausen area',
        sponsored: false,
      },
    ],
    notes: 'Also contacted: Weingut Besson Strasser, Weingut Lenz',
  },
  {
    id: 'stop-hotel-schaffhausen',
    day_id: DAY.apr3,
    time: '20:00',
    place_name: 'Vienna House by Wyndham Zur Bleiche',
    coordinates: { lat: 47.6971, lng: 8.6342 },
    category: 'hotel',
    duration_minutes: 480,
    description: 'Hotel in Schaffhausen area — 130 CHF/room + 20 CHF pet fee',
    origin: 'user_added',
    state: 'suggested',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.2,
        review_count: 870,
        last_updated: '1 week ago',
        note: null,
        sponsored: false,
      },
    ],
    notes: '130 CHF/room + 20 CHF pet fee. Decision pending: stay here or drive to Lucerne.',
  },

  // --- Day 3: Hot springs → Lucerne ---
  {
    id: 'stop-therme-zurzach',
    day_id: DAY.apr4,
    time: '10:00',
    place_name: 'Therme Zurzach',
    coordinates: { lat: 47.5893, lng: 8.2962 },
    category: 'spa',
    duration_minutes: 180,
    description: 'AI-recommended hot spring — pet-friendly outdoor area, ~40 min detour',
    origin: 'ai_suggested',
    state: 'suggested',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.5,
        review_count: 2100,
        last_updated: '3 days ago',
        note: 'Pet-friendly outdoor area. On route Schaffhausen → Lucerne (~40 min detour).',
        sponsored: false,
      },
    ],
    notes: 'AI recommended. Bad Schinznach CLOSED (renovation Mar 2026 — removed).',
  },
  {
    id: 'stop-ennetbaden',
    day_id: DAY.apr4,
    time: '10:00',
    place_name: 'Ennetbaden "Heisse Brunnen"',
    coordinates: { lat: 47.4750, lng: 8.3075 },
    category: 'spa',
    duration_minutes: 90,
    description: 'Free open-air hot spring pools on the riverbank',
    origin: 'ai_suggested',
    state: 'suggested',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.3,
        review_count: 620,
        last_updated: '1 week ago',
        note: 'Free entry. Casual, local feel.',
        sponsored: false,
      },
    ],
    notes: 'Alternative to Therme Zurzach — free entry',
  },
  {
    id: 'stop-lucerne',
    day_id: DAY.apr4,
    time: '14:00',
    place_name: 'Lucerne',
    coordinates: { lat: 47.0502, lng: 8.3093 },
    category: 'sight',
    duration_minutes: 180,
    description: 'Chapel Bridge, old town, lakeside walk',
    origin: 'user_added',
    state: 'confirmed',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.8,
        review_count: 55000,
        last_updated: '1 day ago',
        note: null,
        sponsored: false,
      },
    ],
    notes: 'Fronalpstock / Stoos — check seasonal accessibility before suggesting',
  },

  // --- Day 4: Interlaken area ---
  {
    id: 'stop-lauterbrunnen',
    day_id: DAY.apr5,
    time: '10:00',
    place_name: 'Lauterbrunnen Valley',
    coordinates: { lat: 46.5933, lng: 7.9089 },
    category: 'sight',
    duration_minutes: 240,
    description: 'Best pick for early April — lower altitude, confirmed accessible, waterfalls',
    origin: 'ai_suggested',
    state: 'suggested',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.8,
        review_count: 18700,
        last_updated: '2 days ago',
        note: 'Confirmed accessible in early April. Lower altitude than alternatives.',
        sponsored: false,
      },
    ],
    notes: 'AI top pick for Apr 5. Group vote open.',
  },
  {
    id: 'stop-iseltwald',
    day_id: DAY.apr5,
    time: '10:00',
    place_name: 'Iseltwald + Lake Brienz',
    coordinates: { lat: 46.7085, lng: 7.9758 },
    category: 'sight',
    duration_minutes: 180,
    description: 'Scenic lakeside village and walking along Lake Brienz',
    origin: 'ai_suggested',
    state: 'suggested',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.6,
        review_count: 4300,
        last_updated: '4 days ago',
        note: null,
        sponsored: false,
      },
    ],
    notes: 'Good scenic lakeside walking. Also cheaper accommodation nearby.',
  },
  {
    id: 'stop-grindelwald',
    day_id: DAY.apr5,
    time: '10:00',
    place_name: 'Grindelwald',
    coordinates: { lat: 46.6241, lng: 8.0412 },
    category: 'sight',
    duration_minutes: 180,
    description: 'Accessible in April, quieter than peak season',
    origin: 'ai_suggested',
    state: 'suggested',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.6,
        review_count: 21000,
        last_updated: '3 days ago',
        note: 'Quieter in April but fully accessible.',
        sponsored: false,
      },
    ],
    notes: null,
  },
  {
    id: 'stop-wengen',
    day_id: DAY.apr5,
    time: '10:00',
    place_name: 'Wengen — Männlichen winter hike',
    coordinates: { lat: 46.6084, lng: 7.9225 },
    category: 'sight',
    duration_minutes: 240,
    description: 'Männlichen gondola operating through 6 April, winter hike available',
    origin: 'ai_suggested',
    state: 'suggested',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.7,
        review_count: 6800,
        last_updated: '1 day ago',
        note: 'Männlichen gondola confirmed operating until 6 April.',
        sponsored: false,
      },
    ],
    notes: 'Männlichen gondola closes 6 Apr — check if doing this on Apr 5 or 6.',
  },
  // NOTE: Rosenlaui Valley intentionally EXCLUDED — closed until 14 May 2026.

  // --- Day 5: Final day before split ---
  {
    id: 'stop-bachalpsee',
    day_id: DAY.apr6,
    time: '09:00',
    place_name: 'Bachalpsee',
    coordinates: { lat: 46.6607, lng: 8.0437 },
    category: 'sight',
    duration_minutes: 180,
    description: 'Accessible hike to an alpine lake above Grindelwald',
    origin: 'ai_suggested',
    state: 'suggested',
    hours_today: 'open',
    pet_friendly: true,
    sources: [
      {
        name: 'Google Maps',
        score: 4.8,
        review_count: 7200,
        last_updated: '2 days ago',
        note: null,
        sponsored: false,
      },
    ],
    notes: null,
  },
  {
    id: 'stop-drive-france',
    day_id: DAY.apr6,
    time: '14:00',
    place_name: 'Drive toward France',
    coordinates: null,
    category: 'travel',
    duration_minutes: 300,
    description: 'Jee Eun + Ben start drive back toward France',
    origin: 'user_added',
    state: 'confirmed',
    hours_today: 'unknown',
    pet_friendly: false,
    sources: [],
    notes: null,
  },
  {
    id: 'stop-drive-prague',
    day_id: DAY.apr6,
    time: '14:00',
    place_name: 'Eliška + David depart for Prague',
    coordinates: null,
    category: 'travel',
    duration_minutes: 480,
    description: 'Eliška + David (+ Cali) start return journey to Prague',
    origin: 'user_added',
    state: 'suggested',
    hours_today: 'unknown',
    pet_friendly: true,
    sources: [],
    notes: 'Possibly Mon night or Tue — TBD',
  },

  // --- Day 6: Return ---
  {
    id: 'stop-return-london',
    day_id: DAY.apr7,
    time: '12:00',
    place_name: 'Jee Eun + Ben arrive London',
    coordinates: null,
    category: 'travel',
    duration_minutes: 0,
    description: 'End of trip for London crew',
    origin: 'user_added',
    state: 'confirmed',
    hours_today: 'unknown',
    pet_friendly: false,
    sources: [],
    notes: null,
  },
  {
    id: 'stop-return-prague',
    day_id: DAY.apr7,
    time: '14:00',
    place_name: 'Eliška + David arrive Prague',
    coordinates: null,
    category: 'travel',
    duration_minutes: 0,
    description: 'End of trip for Prague crew',
    origin: 'user_added',
    state: 'suggested',
    hours_today: 'unknown',
    pet_friendly: true,
    sources: [],
    notes: null,
  },
];

// ---------------------------------------------------------------------------
// AI flags (proactive issues to surface in the co-planner)
// ---------------------------------------------------------------------------

const aiFlags = [
  {
    id: 'flag-rosenlaui-closed',
    trip_id: TRIP_ID,
    severity: 'warning',
    title: 'Rosenlaui Valley closed until 14 May 2026',
    body: 'Rosenlaui Valley is closed for the season until 14 May 2026. It has been removed from the Sun 5 Apr and Mon 6 Apr suggestions.',
    affects_stop_ids: [], // removed from stops
    resolved: false,
  },
  {
    id: 'flag-bad-schinznach-closed',
    trip_id: TRIP_ID,
    severity: 'warning',
    title: 'Bad Schinznach under renovation — closed Mar 2026',
    body: 'Bad Schinznach hot spring is closed for renovation as of March 2026. Therme Zurzach is recommended instead (4.5★, 2,100+ reviews, pet-friendly outdoor area, ~40 min detour).',
    affects_stop_ids: [],
    resolved: false,
  },
  {
    id: 'flag-therme-zurzach-recommended',
    trip_id: TRIP_ID,
    severity: 'info',
    title: 'Therme Zurzach — recommended hot spring',
    body: 'Therme Zurzach: 4.5★ on Google (2,100+ reviews). Has a pet-friendly outdoor area. Approximately 40 min detour on the Schaffhausen → Lucerne route.',
    affects_stop_ids: ['stop-therme-zurzach'],
    resolved: false,
  },
  {
    id: 'flag-marcus-ruch-recommended',
    trip_id: TRIP_ID,
    severity: 'info',
    title: 'Marcus Ruch — recommended wine contact',
    body: 'Marcus Ruch is the most-reviewed local wine producer in the Schaffhausen area. Contacted along with Weingut Besson Strasser and Weingut Lenz.',
    affects_stop_ids: ['stop-wine-marcus-ruch'],
    resolved: false,
  },
  {
    id: 'flag-hotel-pet-fee',
    trip_id: TRIP_ID,
    severity: 'info',
    title: 'Vienna House pet fee — 20 CHF on top of 130 CHF/room',
    body: 'The Vienna House by Wyndham Zur Bleiche in Schaffhausen charges 20 CHF pet fee on top of the 130 CHF/room nightly rate.',
    affects_stop_ids: ['stop-hotel-schaffhausen'],
    resolved: false,
  },
];

// ---------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------

async function seed() {
  console.log('🌱 Seeding Waypoint Switzerland trip...\n');

  // Trip
  const { error: tripError } = await supabase
    .from('trips')
    .upsert(trip, { onConflict: 'id' });
  if (tripError) throw new Error(`Trip: ${tripError.message}`);
  console.log('✓ Trip');

  // Members
  const { error: membersError } = await supabase
    .from('members')
    .upsert(members, { onConflict: 'id' });
  if (membersError) throw new Error(`Members: ${membersError.message}`);
  console.log(`✓ Members (${members.length})`);

  // Days
  const { error: daysError } = await supabase
    .from('days')
    .upsert(days, { onConflict: 'id' });
  if (daysError) throw new Error(`Days: ${daysError.message}`);
  console.log(`✓ Days (${days.length})`);

  // Stops
  const { error: stopsError } = await supabase
    .from('stops')
    .upsert(stops, { onConflict: 'id' });
  if (stopsError) throw new Error(`Stops: ${stopsError.message}`);
  console.log(`✓ Stops (${stops.length})`);

  // AI flags
  const { error: flagsError } = await supabase
    .from('ai_flags')
    .upsert(aiFlags, { onConflict: 'id' });
  if (flagsError) throw new Error(`AI flags: ${flagsError.message}`);
  console.log(`✓ AI flags (${aiFlags.length})`);

  console.log('\n✅ Seed complete.');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
