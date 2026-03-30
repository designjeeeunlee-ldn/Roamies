import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';

// react-native-maps is not available on web
const IS_WEB = Platform.OS === 'web';
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let PROVIDER_DEFAULT: any = null;
if (!IS_WEB) {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
  PROVIDER_DEFAULT = Maps.PROVIDER_DEFAULT;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Stop = {
  id: string;
  place_name: string;
  category: string;
  trip_date: string;
  stop_time: string | null;
  description: string | null;
  coords?: { latitude: number; longitude: number };
  geocodeStatus: 'pending' | 'done' | 'failed';
};

type Photo = {
  id: string;
  storage_path: string;
  trip_date: string | null;
  publicUrl: string;
};

type Tab = 'plan' | 'album' | 'route';

// ── Geocoding (OpenStreetMap Nominatim — free, no key) ────────────────────────

const geocodeCache: Record<string, { latitude: number; longitude: number } | null> = {};

async function geocodePlace(
  placeName: string,
): Promise<{ latitude: number; longitude: number } | null> {
  if (placeName in geocodeCache) return geocodeCache[placeName];
  try {
    const q = encodeURIComponent(placeName);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Roamies/1.0 (travel-planning-app)' } },
    );
    const data = await res.json();
    const result = data?.[0]
      ? { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) }
      : null;
    geocodeCache[placeName] = result;
    return result;
  } catch {
    geocodeCache[placeName] = null;
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fitRegion(coords: { latitude: number; longitude: number }[]) {
  if (!coords.length) return null;
  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const padLat = Math.max((maxLat - minLat) * 0.25, 0.04);
  const padLng = Math.max((maxLng - minLng) * 0.25, 0.04);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: maxLat - minLat + padLat,
    longitudeDelta: maxLng - minLng + padLng,
  };
}

const CATEGORY_STYLE: Record<string, { color: string; icon: string }> = {
  restaurant:    { color: '#F97316', icon: 'restaurant-outline' },
  food:          { color: '#F97316', icon: 'restaurant-outline' },
  cafe:          { color: '#C4956A', icon: 'cafe-outline' },
  transport:     { color: '#3B82F6', icon: 'car-outline' },
  accommodation: { color: '#6B3FA0', icon: 'bed-outline' },
  hotel:         { color: '#6B3FA0', icon: 'bed-outline' },
  activity:      { color: '#10B981', icon: 'ticket-outline' },
  sightseeing:   { color: '#10B981', icon: 'binoculars-outline' },
  nature:        { color: '#3D7A52', icon: 'leaf-outline' },
  museum:        { color: '#6B3FA0', icon: 'library-outline' },
};

function catStyle(cat: string) {
  return CATEGORY_STYLE[cat.toLowerCase()] ?? { color: '#9CA3AF', icon: 'location-outline' };
}

function formatDay(isoDate: string) {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });
}

function getPublicUrl(path: string): string {
  return supabase.storage.from('trip-photos').getPublicUrl(path).data.publicUrl;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PastTripRouteScreen() {
  const router = useRouter();
  const { id, name, dates } = useLocalSearchParams<{ id: string; name?: string; dates?: string }>();
  const { height, width } = useWindowDimensions();

  const [tab, setTab] = useState<Tab>('plan');

  // ── Stops state ──────────────────────────────────────────────────────────────
  const [stops, setStops] = useState<Stop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(true);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [geocodingDone, setGeocodingDone] = useState(false);
  const cancelledRef = useRef(false);
  const mapRef = useRef<any>(null);

  // ── Photos state ─────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);

  // ── 1. Load stops ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) { setStopsLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from('stops')
        .select('id, place_name, category, trip_date, stop_time, description')
        .eq('trip_id', id)
        .order('trip_date', { ascending: true })
        .order('stop_time', { ascending: true, nullsFirst: false });

      const raw = (data ?? []) as Omit<Stop, 'geocodeStatus'>[];
      setStops(raw.map((s) => ({ ...s, geocodeStatus: 'pending' })));
      setStopsLoading(false);
    })();
  }, [id]);

  // ── 2. Load photos ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) { setPhotosLoading(false); return; }
    supabase
      .from('trip_photos')
      .select('id, storage_path, trip_date')
      .eq('trip_id', id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setPhotos((data ?? []).map((p: any) => ({
          id: p.id,
          storage_path: p.storage_path,
          trip_date: p.trip_date,
          publicUrl: getPublicUrl(p.storage_path),
        })));
        setPhotosLoading(false);
      });
  }, [id]);

  // ── 3. Geocode stops sequentially when route tab is opened ───────────────────
  useEffect(() => {
    if (tab !== 'route') return;
    if (stopsLoading || !stops.length) return;
    if (geocodingDone) return; // already done
    cancelledRef.current = false;

    (async () => {
      for (let i = 0; i < stops.length; i++) {
        if (cancelledRef.current) break;
        if (i > 0) await new Promise((r) => setTimeout(r, 400));
        const coords = await geocodePlace(stops[i].place_name);
        if (!cancelledRef.current) {
          setStops((prev) =>
            prev.map((s, idx) =>
              idx === i
                ? { ...s, coords: coords ?? undefined, geocodeStatus: coords ? 'done' : 'failed' }
                : s,
            ),
          );
          setGeocodedCount(i + 1);
        }
      }
      if (!cancelledRef.current) setGeocodingDone(true);
    })();

    return () => { cancelledRef.current = true; };
  }, [tab, stopsLoading, stops.length]);

  // ── 4. Fit map once geocoding completes ──────────────────────────────────────
  useEffect(() => {
    if (!geocodingDone || IS_WEB || !mapRef.current) return;
    const coords = stops.filter((s) => s.coords).map((s) => s.coords!);
    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      });
    }
  }, [geocodingDone]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const routeCoords = stops.filter((s) => s.coords).map((s) => s.coords!);
  const initialRegion = routeCoords.length
    ? fitRegion(routeCoords)
    : { latitude: 47.3769, longitude: 8.5417, latitudeDelta: 3, longitudeDelta: 3 };

  const byDate = stops.reduce<Record<string, Stop[]>>((acc, s) => {
    (acc[s.trip_date] ??= []).push(s);
    return acc;
  }, {});

  const photoThumbSize = (width - 48) / 3;
  const mapHeight = height * 0.42;

  // ── Stop timeline (shared between Plan and Route tabs) ────────────────────────
  function StopTimeline({ showGeocodeStatus }: { showGeocodeStatus?: boolean }) {
    if (stopsLoading) return <ActivityIndicator style={{ marginTop: 32 }} color="#6B3FA0" />;
    if (stops.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={40} color="#C4B5FD" />
          <Text style={styles.emptyTitle}>No stops recorded</Text>
          <Text style={styles.emptySub}>Stops added during this trip will appear here.</Text>
        </View>
      );
    }
    return (
      <>
        {Object.entries(byDate).map(([date, dayStops]) => (
          <View key={date} style={styles.dayGroup}>
            <Text style={styles.dayLabel}>{formatDay(date)}</Text>
            {dayStops.map((stop, i) => {
              const { color, icon } = catStyle(stop.category);
              const isLast = i === dayStops.length - 1;
              return (
                <View key={stop.id} style={styles.stopRow}>
                  <View style={styles.timelineCol}>
                    <View style={[styles.timelineDot, { backgroundColor: color }]} />
                    {!isLast && <View style={[styles.timelineLine, { backgroundColor: color + '30' }]} />}
                  </View>
                  <View style={[styles.stopCard, { borderLeftColor: color }]}>
                    <View style={styles.stopCardRow}>
                      <View style={[styles.stopIconCircle, { backgroundColor: color + '18' }]}>
                        <Ionicons name={icon as any} size={14} color={color} />
                      </View>
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={styles.stopName}>{stop.place_name}</Text>
                        {stop.stop_time && <Text style={styles.stopTime}>{stop.stop_time.slice(0, 5)}</Text>}
                      </View>
                      {showGeocodeStatus && (
                        <View style={styles.stopStatus}>
                          {stop.geocodeStatus === 'done' && (
                            <View style={styles.mappedBadge}>
                              <Ionicons name="location" size={11} color="#6B3FA0" />
                              <Text style={styles.mappedText}>mapped</Text>
                            </View>
                          )}
                          {stop.geocodeStatus === 'pending' && (
                            <ActivityIndicator size="small" color="#C4B5FD" />
                          )}
                        </View>
                      )}
                    </View>
                    {!!stop.description && <Text style={styles.stopDesc} numberOfLines={2}>{stop.description}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
        <View style={{ height: 40 }} />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{name ?? 'Trip Record'}</Text>
          {dates ? (
            <Text style={styles.headerSub}>{dates}</Text>
          ) : (
            <Text style={styles.headerSub}>
              {stops.length} stop{stops.length !== 1 ? 's' : ''} · {photos.length} photo{photos.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={styles.tabBar}>
        {(['plan', 'album', 'route'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={t === 'plan' ? 'list-outline' : t === 'album' ? 'images-outline' : 'map-outline'}
              size={15}
              color={tab === t ? '#6B3FA0' : '#9CA3AF'}
            />
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Plan tab ── */}
      {tab === 'plan' && (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          <StopTimeline />
        </ScrollView>
      )}

      {/* ── Album tab ── */}
      {tab === 'album' && (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {photosLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#6B3FA0" />
          ) : photos.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={40} color="#C4B5FD" />
              <Text style={styles.emptyTitle}>No photos yet</Text>
              <Text style={styles.emptySub}>Photos uploaded during this trip will appear here.</Text>
            </View>
          ) : (
            <View style={styles.photoGrid}>
              {photos.map((photo) => (
                <Image
                  key={photo.id}
                  source={{ uri: photo.publicUrl }}
                  style={[styles.photoThumb, { width: photoThumbSize, height: photoThumbSize }]}
                  resizeMode="cover"
                />
              ))}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── Route tab ── */}
      {tab === 'route' && (
        <>
          {/* Map */}
          {IS_WEB ? (
            <View style={[styles.mapFallback, { height: mapHeight }]}>
              <Ionicons name="map-outline" size={44} color="#C4B5FD" />
              <Text style={styles.mapFallbackText}>Map is available in the mobile app</Text>
            </View>
          ) : stopsLoading ? (
            <View style={[styles.mapFallback, { height: mapHeight }]}>
              <ActivityIndicator size="large" color="#6B3FA0" />
              <Text style={styles.mapFallbackText}>Loading stops…</Text>
            </View>
          ) : stops.length === 0 ? (
            <View style={[styles.mapFallback, { height: mapHeight }]}>
              <Ionicons name="map-outline" size={44} color="#C4B5FD" />
              <Text style={styles.mapFallbackText}>No stops recorded for this trip</Text>
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={{ height: mapHeight }}
              provider={PROVIDER_DEFAULT}
              initialRegion={initialRegion ?? undefined}
              showsUserLocation={false}
              showsCompass
              showsScale
            >
              {routeCoords.length >= 2 && (
                <Polyline
                  coordinates={routeCoords}
                  strokeColor="#6B3FA0"
                  strokeWidth={2.5}
                  lineDashPattern={[8, 5]}
                />
              )}
              {stops.filter((s) => s.coords).map((stop, idx) => {
                const { color } = catStyle(stop.category);
                return (
                  <Marker
                    key={stop.id}
                    coordinate={stop.coords!}
                    title={stop.place_name}
                    description={stop.stop_time ? stop.stop_time.slice(0, 5) : stop.trip_date}
                  >
                    <View style={styles.markerWrap}>
                      <View style={[styles.markerBubble, { backgroundColor: color }]}>
                        <Text style={styles.markerNum}>{idx + 1}</Text>
                      </View>
                      <View style={[styles.markerTail, { borderTopColor: color }]} />
                    </View>
                  </Marker>
                );
              })}
            </MapView>
          )}

          {/* Stop list below map */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            <StopTimeline showGeocodeStatus />
          </ScrollView>
        </>
      )}

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F8' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 18, backgroundColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827', letterSpacing: -0.2 },
  headerSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#6B3FA0' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  tabLabelActive: { color: '#6B3FA0' },

  mapFallback: {
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mapFallbackText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },

  markerWrap: { alignItems: 'center' },
  markerBubble: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  markerNum: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  markerTail: {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: -1,
  },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 16 },

  dayGroup: { marginBottom: 20 },
  dayLabel: {
    fontSize: 12, fontWeight: '800', color: '#6B7280',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10,
  },

  stopRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  timelineCol: { alignItems: 'center', width: 16, paddingTop: 4 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 2 },
  timelineLine: { width: 2, flex: 1, minHeight: 16, marginTop: 4, borderRadius: 1 },

  stopCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stopCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopIconCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stopName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  stopTime: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  stopDesc: { fontSize: 12, color: '#6B7280', lineHeight: 16 },
  stopStatus: { flexShrink: 0 },
  mappedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  mappedText: { fontSize: 10, color: '#6B3FA0', fontWeight: '600' },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: { borderRadius: 10, backgroundColor: '#E5E7EB' },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', maxWidth: 240 },
});
