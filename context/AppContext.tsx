import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';

// Robust date parser for "MMM D, YYYY" format (avoids React Native locale issues)
const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};
function parseLabelDate(label: string): number {
  const m = label.match(/(\w{3})\s+(\d{1,2}),\s+(\d{4})/);
  if (!m || MONTH_MAP[m[1]] === undefined) return Infinity;
  return new Date(parseInt(m[3]), MONTH_MAP[m[1]], parseInt(m[2])).getTime();
}
function parseLabelRange(label: string): { start: number; end: number } | null {
  const parts = label.split(/\s*[–-]\s*/);
  const start = parseLabelDate(parts[0] ?? '');
  const end   = parseLabelDate(parts[1] ?? parts[0] ?? '');
  if (!isFinite(start)) return null;
  return { start, end: isFinite(end) ? end : start };
}
import type {
  DbProfile,
  DbTrip,
  DbTripMemberWithProfile,
  DbStop,
  DbExpense,
  DbTripPhoto,
  TravelStatus,
  ExpenseCategory,
} from '../lib/database.types';

// ── UI-facing types ───────────────────────────────────────────

export type Member = {
  id: string;          // user UUID
  name: string;
  initials: string;
  color: string;
  role: 'planner' | 'contributor';
};

export type AppStop = {
  id: string;
  time: string;
  place_name: string;
  category: string;
  description: string;
  hours_today: 'open' | 'closed' | 'unknown';
  duration_minutes: number;
  pet_friendly: boolean;
  origin: 'ai_suggested' | 'user_added';
  sources: [];
  cost?: '$' | '$$' | '$$$' | 'free';
};

export type AppExpense = {
  id: string;
  title: string;
  amount: number;          // in CHF
  paidBy: string;          // user UUID
  splitWith: string[];     // user UUIDs
  category: ExpenseCategory;
  date: string;
};

export type AppPhoto = {
  id: string;
  tripDate: string;
  stopId: string | null;
  uploadedBy: string | null;
  storagePath: string;
  publicUrl: string;
  createdAt: string;
};

// ── Context shape ─────────────────────────────────────────────

type AppContextType = {
  // Auth
  userId: string | null;

  // Profile
  profile: DbProfile | null;
  profileLoading: boolean;
  updateProfile: (
    updates: Partial<Pick<DbProfile, 'display_name' | 'handle' | 'location' | 'travel_status'>>
  ) => Promise<void>;

  // Active trip
  activeTrip: DbTrip | null;
  allTrips: DbTrip[];
  tripLoading: boolean;
  setActiveTripId: (id: string) => void;
  updateTrip: (id: string, updates: Partial<Pick<DbTrip, 'name' | 'dates_label'>>) => Promise<void>;
  deleteTrip: (id: string) => Promise<void>;

  // Members
  members: Member[];

  // Stops for a given date (defaults to today)
  todayStops: AppStop[];
  stopsLoading: boolean;
  addStop: (stop: Omit<AppStop, 'id'>, date?: string) => Promise<void>;
  loadStopsForDate: (date: string) => Promise<AppStop[]>;

  // Expenses
  expenses: AppExpense[];
  expensesLoading: boolean;
  addExpense: (expense: Omit<AppExpense, 'id'>) => Promise<void>;

  // Photos
  tripPhotos: AppPhoto[];
  photosLoading: boolean;
  uploadPhoto: (uri: string, tripDate: string, stopId?: string | null) => Promise<void>;
};

const AppContext = createContext<AppContextType | null>(null);

// ── Helpers ───────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function dbStopToAppStop(s: DbStop): AppStop {
  return {
    id: s.id,
    time: s.stop_time ?? '--:--',
    place_name: s.place_name,
    category: s.category,
    description: s.description ?? '',
    hours_today: 'unknown',
    duration_minutes: s.duration_minutes,
    pet_friendly: s.pet_friendly,
    origin: (s.origin === 'ai_suggested' ? 'ai_suggested' : 'user_added'),
    sources: [],
    cost: (s.cost as AppStop['cost']) ?? undefined,
  };
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function getPhotoPublicUrl(path: string): string {
  return supabase.storage.from('trip-photos').getPublicUrl(path).data.publicUrl;
}

function dbPhotoToAppPhoto(p: DbTripPhoto): AppPhoto {
  return {
    id: p.id,
    tripDate: p.trip_date,
    stopId: p.stop_id,
    uploadedBy: p.uploaded_by,
    storagePath: p.storage_path,
    publicUrl: getPhotoPublicUrl(p.storage_path),
    createdAt: p.created_at,
  };
}

// ── Provider ──────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [activeTrip, setActiveTrip] = useState<DbTrip | null>(null);
  const [allTrips, setAllTrips] = useState<DbTrip[]>([]);
  const [tripLoading, setTripLoading] = useState(true);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);

  const [todayStops, setTodayStops] = useState<AppStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);

  const [expenses, setExpenses] = useState<AppExpense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);

  const [tripPhotos, setTripPhotos] = useState<AppPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  // ── Load user on mount ──────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load profile when userId is known ──────────────────────
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error && error.code !== 'PGRST116') {
          console.warn('Profile fetch error:', error.message);
        }
        setProfile(data as DbProfile | null);
        setProfileLoading(false);
      });
  }, [userId]);

  // ── Load active trip when userId is known ──────────────────
  useEffect(() => {
    if (!userId) {
      setActiveTrip(null);
      setTripLoading(false);
      return;
    }
    setTripLoading(true);

    const query = activeTripId
      ? supabase.from('trips').select('*').eq('id', activeTripId).single()
      : supabase
          .from('trips')
          .select('*')
          .eq('is_active', true)
          .or(`created_by.eq.${userId},id.in.(${
            // subquery workaround: fetch trip_ids first, handled below
            'placeholder'
          })`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

    // Simpler: fetch trip_member rows first, then trip
    supabase
      .from('trip_members')
      .select('trip_id')
      .eq('user_id', userId)
      .then(async ({ data: memberRows }) => {
        const memberTripIds = (memberRows ?? []).map((r: any) => r.trip_id);

        const { data: trips } = await supabase
          .from('trips')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        const myTrips = (trips ?? []).filter(
          (t: any) =>
            t.created_by === userId || memberTripIds.includes(t.id)
        );

        // Sort by start date ascending (no dates → end of list)
        const sorted = [...myTrips].sort((a: any, b: any) => {
          const aMs = a.dates_label ? parseLabelDate(a.dates_label) : Infinity;
          const bMs = b.dates_label ? parseLabelDate(b.dates_label) : Infinity;
          return aMs - bMs;
        });
        setAllTrips(sorted as DbTrip[]);

        // Priority: explicit selection → ongoing trip → nearest upcoming → first
        const nowMs = new Date().setHours(0, 0, 0, 0);
        const ongoingTrip = sorted.find((t: any) => {
          if (!t.dates_label) return false;
          const r = parseLabelRange(t.dates_label);
          if (!r) return false;
          return nowMs >= r.start && nowMs <= r.end + 86400000 - 1;
        }) ?? null;
        const target = activeTripId
          ? sorted.find((t: any) => t.id === activeTripId) ?? null
          : ongoingTrip ?? sorted[0] ?? null;

        setActiveTrip(target as DbTrip | null);
        setTripLoading(false);
      });
  }, [userId, activeTripId]);

  // ── Load members when activeTrip changes ───────────────────
  useEffect(() => {
    if (!activeTrip) { setMembers([]); return; }
    supabase
      .from('trip_members')
      .select('*, profile:profiles(*)')
      .eq('trip_id', activeTrip.id)
      .then(({ data }) => {
        const rows = (data ?? []) as DbTripMemberWithProfile[];
        setMembers(
          rows.map((r) => ({
            id: r.user_id,
            name: r.profile?.display_name ?? 'Unknown',
            initials: initials(r.profile?.display_name ?? '?'),
            color: r.display_color,
            role: r.role,
          }))
        );
      });
  }, [activeTrip?.id]);

  // ── Load today's stops when activeTrip changes ─────────────
  useEffect(() => {
    if (!activeTrip) { setTodayStops([]); return; }
    setStopsLoading(true);
    supabase
      .from('stops')
      .select('*')
      .eq('trip_id', activeTrip.id)
      .eq('trip_date', todayIso())
      .order('stop_time', { ascending: true })
      .then(({ data }) => {
        setTodayStops((data ?? []).map((s: any) => dbStopToAppStop(s as DbStop)));
        setStopsLoading(false);
      });
  }, [activeTrip?.id]);

  // ── Load expenses when activeTrip changes ──────────────────
  useEffect(() => {
    if (!activeTrip) { setExpenses([]); return; }
    setExpensesLoading(true);
    supabase
      .from('expenses')
      .select('*')
      .eq('trip_id', activeTrip.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setExpenses(
          (data ?? []).map((e: any) => ({
            id: e.id,
            title: e.title,
            amount: Number(e.amount_chf),
            paidBy: e.paid_by,
            splitWith: e.split_with ?? [],
            category: e.category as ExpenseCategory,
            date: e.expense_date ?? '',
          }))
        );
        setExpensesLoading(false);
      });
  }, [activeTrip?.id]);

  // ── Load photos when activeTrip changes ────────────────────
  useEffect(() => {
    if (!activeTrip) { setTripPhotos([]); return; }
    setPhotosLoading(true);
    supabase
      .from('trip_photos')
      .select('*')
      .eq('trip_id', activeTrip.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setTripPhotos((data ?? []).map((p: any) => dbPhotoToAppPhoto(p as DbTripPhoto)));
        setPhotosLoading(false);
      });
  }, [activeTrip?.id]);

  // ── updateProfile ───────────────────────────────────────────
  const updateProfile = useCallback(
    async (
      updates: Partial<Pick<DbProfile, 'display_name' | 'handle' | 'location' | 'travel_status'>>
    ) => {
      if (!userId) return;
      const { data } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() })
        .select()
        .single();
      if (data) setProfile(data as DbProfile);
    },
    [userId]
  );

  // ── addStop ─────────────────────────────────────────────────
  const addStop = useCallback(
    async (stop: Omit<AppStop, 'id'>, date?: string) => {
      if (!activeTrip || !userId) return;
      const tripDate = date ?? todayIso();
      const row = {
        trip_id: activeTrip.id,
        trip_date: tripDate,
        place_name: stop.place_name,
        stop_time: stop.time === '--:--' ? null : stop.time,
        category: stop.category,
        description: stop.description || null,
        duration_minutes: stop.duration_minutes,
        cost: stop.cost ?? null,
        origin: stop.origin,
        pet_friendly: stop.pet_friendly,
        created_by: userId,
      };
      const { data } = await supabase.from('stops').insert(row).select().single();
      // Only update local today cache if the stop was added for today
      if (data && tripDate === todayIso()) {
        setTodayStops((prev) => [...prev, dbStopToAppStop(data as DbStop)]);
      }
    },
    [activeTrip, userId]
  );

  // ── loadStopsForDate ─────────────────────────────────────────
  const loadStopsForDate = useCallback(
    async (date: string): Promise<AppStop[]> => {
      if (!activeTrip) return [];
      const { data } = await supabase
        .from('stops')
        .select('*')
        .eq('trip_id', activeTrip.id)
        .eq('trip_date', date)
        .order('stop_time', { ascending: true });
      return (data ?? []).map((s: any) => dbStopToAppStop(s as DbStop));
    },
    [activeTrip]
  );

  // ── addExpense ──────────────────────────────────────────────
  const addExpense = useCallback(
    async (expense: Omit<AppExpense, 'id'>) => {
      if (!activeTrip) return;
      const row = {
        trip_id: activeTrip.id,
        title: expense.title,
        amount_chf: expense.amount,
        paid_by: expense.paidBy,
        split_with: expense.splitWith,
        category: expense.category,
        expense_date: expense.date || null,
      };
      const { data } = await supabase.from('expenses').insert(row).select().single();
      if (data) {
        const e = data as any;
        setExpenses((prev) => [
          ...prev,
          {
            id: e.id,
            title: e.title,
            amount: Number(e.amount_chf),
            paidBy: e.paid_by,
            splitWith: e.split_with ?? [],
            category: e.category as ExpenseCategory,
            date: e.expense_date ?? '',
          },
        ]);
      }
    },
    [activeTrip]
  );

  // ── uploadPhoto ─────────────────────────────────────────────
  const uploadPhoto = useCallback(
    async (uri: string, tripDate: string, stopId?: string | null) => {
      if (!activeTrip || !userId) return;
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const filename = `${Date.now()}.${ext}`;
      const path = `${activeTrip.id}/${tripDate}/${filename}`;

      // Fetch the local image as an ArrayBuffer for upload
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('trip-photos')
        .upload(path, arrayBuffer, { contentType: `image/${ext}`, upsert: false });

      if (uploadError) {
        console.warn('Photo upload error:', uploadError.message);
        return;
      }

      const { data } = await supabase
        .from('trip_photos')
        .insert({
          trip_id: activeTrip.id,
          stop_id: stopId ?? null,
          trip_date: tripDate,
          uploaded_by: userId,
          storage_path: path,
        })
        .select()
        .single();

      if (data) {
        setTripPhotos((prev) => [...prev, dbPhotoToAppPhoto(data as DbTripPhoto)]);
      }
    },
    [activeTrip, userId]
  );

  // ── updateTrip ──────────────────────────────────────────────
  const updateTrip = useCallback(
    async (id: string, updates: Partial<Pick<DbTrip, 'name' | 'dates_label'>>) => {
      await supabase.from('trips').update(updates).eq('id', id);
      setAllTrips((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
      setActiveTrip((prev) => prev?.id === id ? { ...prev, ...updates } : prev);
    },
    []
  );

  const deleteTrip = useCallback(async (id: string) => {
    // Delete in dependency order, bail on first hard error
    const r1 = await supabase.from('expenses').delete().eq('trip_id', id);
    if (r1.error) throw new Error(r1.error.message);
    const r2 = await supabase.from('stops').delete().eq('trip_id', id);
    if (r2.error) throw new Error(r2.error.message);
    const r3 = await supabase.from('trip_members').delete().eq('trip_id', id);
    if (r3.error) throw new Error(r3.error.message);
    const r4 = await supabase.from('trips').delete().eq('id', id);
    if (r4.error) throw new Error(r4.error.message);
    // Remove from local state
    setAllTrips((prev) => prev.filter((t) => t.id !== id));
    setActiveTrip((prev) => (prev?.id === id ? null : prev));
    setActiveTripId((prev) => (prev === id ? null : prev));
  }, []);

  return (
    <AppContext.Provider
      value={{
        userId,
        profile,
        profileLoading,
        updateProfile,
        activeTrip,
        allTrips,
        tripLoading,
        setActiveTripId,
        updateTrip,
        deleteTrip,
        members,
        todayStops,
        stopsLoading,
        addStop,
        loadStopsForDate,
        expenses,
        expensesLoading,
        addExpense,
        tripPhotos,
        photosLoading,
        uploadPhoto,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
