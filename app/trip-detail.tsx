import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PHOTO_TILE = (SCREEN_WIDTH - 40 - 20 - 8) / 3; // 3-column grid
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { savePhotoToDevice } from '../lib/useSavePhoto';
import { TRIP_COLORS, parseDatesLabel } from '../components/TripCalendar';
import { formatTripDates, tripCountdown } from '../lib/dateFormat';
import ScreenHeader from '../components/ScreenHeader';
import type { DbStop, DbTripMemberWithProfile } from '../lib/database.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}


function groupByDate(stops: DbStop[]): { date: string; stops: DbStop[] }[] {
  const map: Record<string, DbStop[]> = {};
  for (const s of stops) {
    if (!map[s.trip_date]) map[s.trip_date] = [];
    map[s.trip_date].push(s);
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stops]) => ({ date, stops }));
}

function formatDateLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const CATEGORY_ICONS: Record<string, string> = {
  food: 'restaurant-outline',
  sight: 'camera-outline',
  travel: 'train-outline',
  hotel: 'bed-outline',
  spa: 'water-outline',
  free: 'leaf-outline',
  wine: 'wine-outline',
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TripDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { allTrips, setActiveTripId, tripPhotos, activeTrip, addStop, updateTrip } = useApp();

  const tripIndex = allTrips.findIndex((t) => t.id === id);
  const trip = tripIndex >= 0 ? allTrips[tripIndex] : null;
  const accentColor = TRIP_COLORS[tripIndex >= 0 ? tripIndex % TRIP_COLORS.length : 0];

  const [stops, setStops] = useState<DbStop[]>([]);
  const [members, setMembers] = useState<DbTripMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit-trip modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDates, setEditDates] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const openEditModal = () => {
    setEditName(trip?.name ?? '');
    setEditDates(trip?.dates_label ?? '');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!trip || !editName.trim()) return;
    setEditSaving(true);
    await updateTrip(trip.id, {
      name: editName.trim(),
      dates_label: editDates.trim() || null,
    });
    setEditSaving(false);
    setEditModalVisible(false);
  };

  // Add-stop modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addPlace, setAddPlace] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addHour, setAddHour] = useState(9);
  const [addMinute, setAddMinute] = useState(0);
  const [addAmPm, setAddAmPm] = useState<'AM' | 'PM'>('AM');
  const [addCategory, setAddCategory] = useState('sight');
  const [addSaving, setAddSaving] = useState(false);

  // Build list of dates in the trip range
  const tripDates: string[] = (() => {
    if (!trip?.dates_label) return [];
    const r = parseDatesLabel(trip.dates_label);
    if (!r) return [];
    const dates: string[] = [];
    const cur = new Date(r.start);
    cur.setHours(12, 0, 0, 0);
    const end = new Date(r.end);
    end.setHours(12, 0, 0, 0);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  })();

  const adjustAddHour = (d: 1 | -1) =>
    setAddHour((h) => (h + d === 0 ? 12 : h + d === 13 ? 1 : h + d));
  const adjustAddMinute = (d: 1 | -1) =>
    setAddMinute((m) => (m + d * 5 + 60) % 60);

  const handleAddStop = async () => {
    if (!addPlace.trim() || !addDate || !trip) return;
    setAddSaving(true);
    setActiveTripId(trip.id);
    const timeStr = `${addHour}:${String(addMinute).padStart(2, '0')} ${addAmPm}`;
    await addStop(
      {
        time: timeStr,
        place_name: addPlace.trim(),
        category: addCategory,
        description: '',
        hours_today: 'unknown',
        duration_minutes: 60,
        origin: 'user_added',
        pet_friendly: false,
        sources: [] as [],
      },
      addDate
    );
    // Refresh stops list
    const { data } = await supabase
      .from('stops')
      .select('*')
      .eq('trip_id', trip.id)
      .order('trip_date', { ascending: true })
      .order('stop_time', { ascending: true });
    if (data) setStops(data as DbStop[]);
    setAddPlace('');
    setAddCategory('sight');
    setAddSaving(false);
    setAddModalVisible(false);
  };

  const CATEGORY_OPTIONS = ['sight', 'food', 'hotel', 'travel', 'spa', 'free'];
  const CATEGORY_LABELS: Record<string, string> = {
    food: 'Food', sight: 'Sightseeing', travel: 'Travel',
    hotel: 'Hotel', free: 'Free time', spa: 'Hot spring', wine: 'Wine',
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      supabase
        .from('stops')
        .select('*')
        .eq('trip_id', id)
        .order('trip_date', { ascending: true })
        .order('stop_time', { ascending: true }),
      supabase
        .from('trip_members')
        .select('*, profile:profiles(*)')
        .eq('trip_id', id),
    ]).then(([stopsRes, membersRes]) => {
      setStops((stopsRes.data ?? []) as DbStop[]);
      setMembers((membersRes.data ?? []) as DbTripMemberWithProfile[]);
      setLoading(false);
    });
  }, [id]);

  const deleteStop = (stopId: string) => {
    Alert.alert('Delete stop', 'Remove this stop from the itinerary?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('stops').delete().eq('id', stopId);
          if (!error) setStops((prev) => prev.filter((s) => s.id !== stopId));
        },
      },
    ]);
  };

  const grouped = groupByDate(stops);
  const cd = tripCountdown(trip?.dates_label);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title={trip?.name ?? 'Trip'}
        badge={cd?.text}
        badgeActive={cd?.active}
        onBack={() => router.back()}
        rightIcon="people-outline"
        onRightPress={() => {
          if (trip) setActiveTripId(trip.id);
          router.push('/(tabs)/group');
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero banner */}
        <View style={[styles.heroBanner, { backgroundColor: accentColor }]}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroName}>{trip?.name ?? '—'}</Text>
            {trip?.dates_label && (
              <Text style={styles.heroDates}>{formatTripDates(trip.dates_label)}</Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.heroEditBtn}
            onPress={openEditModal}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>

        {/* Members */}
        {members.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TRAVELLERS</Text>
            <View style={styles.memberRow}>
              {members.map((m) => {
                const name = m.profile?.display_name ?? '?';
                const color = m.display_color ?? accentColor;
                return (
                  <View key={m.user_id} style={styles.memberBubble}>
                    <View style={[styles.memberAvatar, { backgroundColor: color }]}>
                      <Text style={styles.memberInitials}>{initials(name)}</Text>
                    </View>
                    <Text style={styles.memberName} numberOfLines={1}>{name.split(' ')[0]}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Itinerary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>ITINERARY</Text>
            <TouchableOpacity
              style={styles.addStopBtn}
              onPress={() => {
                setAddDate(tripDates[0] ?? new Date().toISOString().slice(0, 10));
                setAddModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={14} color="#6B3FA0" />
              <Text style={styles.addStopBtnText}>Add stop</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={accentColor} style={{ marginTop: 24 }} />
          ) : grouped.length === 0 ? (
            <View style={styles.emptyItinerary}>
              <Ionicons name="map-outline" size={32} color="#D1D5DB" />
              <Text style={styles.emptyItineraryText}>No stops added yet.</Text>
              <Text style={styles.emptyItinerarySub}>Head to the Today tab to start building your itinerary.</Text>
            </View>
          ) : (
            grouped.map(({ date, stops }) => (
              <View key={date} style={styles.dayGroup}>
                <View style={[styles.dayDot, { backgroundColor: accentColor }]} />
                <View style={styles.dayContent}>
                  <Text style={styles.dayLabel}>{formatDateLabel(date)}</Text>
                  {stops.map((s) => (
                    <View key={s.id} style={styles.stopRow}>
                      <View style={[styles.stopIconCircle, { backgroundColor: accentColor + '18' }]}>
                        <Ionicons
                          name={(CATEGORY_ICONS[s.category] ?? 'location-outline') as any}
                          size={14}
                          color={accentColor}
                        />
                      </View>
                      <View style={styles.stopInfo}>
                        <Text style={styles.stopName}>{s.place_name}</Text>
                        {s.stop_time && <Text style={styles.stopTime}>{s.stop_time}</Text>}
                      </View>
                      <TouchableOpacity
                        onPress={() => deleteStop(s.id)}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        activeOpacity={0.7}
                        style={styles.deleteBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>

        {/* Memories */}
        {(() => {
          const photos = tripPhotos.filter((p) => (p as any).trip_id === id || true)
            .filter((p) => p.publicUrl);
          // Only show if this trip's photos (tripPhotos is already scoped to activeTrip)
          if (trip?.id !== activeTrip?.id) return null;
          return (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>MEMORIES</Text>
                <Text style={styles.photoCount}>{tripPhotos.length} photo{tripPhotos.length !== 1 ? 's' : ''}</Text>
              </View>
              {tripPhotos.length === 0 ? (
                <View style={styles.emptyMemories}>
                  <Ionicons name="images-outline" size={28} color="#D1D5DB" />
                  <Text style={styles.emptyMemoriesText}>No photos yet</Text>
                </View>
              ) : (
                <View style={styles.photoGrid}>
                  {tripPhotos.slice(0, 9).map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      onLongPress={() => savePhotoToDevice(p.publicUrl)}
                      delayLongPress={400}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: p.publicUrl }} style={styles.photoTile} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })()}

        {/* Quick actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.85}
            onPress={() => {
              if (trip) setActiveTripId(trip.id);
              router.push('/invite');
            }}
          >
            <Ionicons name="person-add-outline" size={18} color="#6B3FA0" />
            <Text style={styles.actionBtnText}>Invite members</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: accentColor }]}
            activeOpacity={0.85}
            onPress={() => {
              if (trip) setActiveTripId(trip.id);
              router.push('/(tabs)/group');
            }}
          >
            <Ionicons name="card-outline" size={18} color="#FFFFFF" />
            <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Expenses & group</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Trip Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setEditModalVisible(false)}>
            <Pressable style={styles.drawer} onPress={() => {}}>
              <View style={styles.drawerHandle} />
              <Text style={styles.drawerTitle}>Edit Trip</Text>

              <Text style={styles.drawerFieldLabel}>Trip Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="airplane-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.input}
                  placeholder="Trip name"
                  placeholderTextColor="#9CA3AF"
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                />
              </View>

              <Text style={styles.drawerFieldLabel}>Dates</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="calendar-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Apr 3, 2025 – Apr 7, 2025"
                  placeholderTextColor="#9CA3AF"
                  value={editDates}
                  onChangeText={setEditDates}
                />
              </View>

              <TouchableOpacity
                style={[styles.confirmBtn, !editName.trim() && styles.confirmBtnDisabled]}
                onPress={handleSaveEdit}
                activeOpacity={0.85}
                disabled={editSaving || !editName.trim()}
              >
                {editSaving
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.confirmBtnText}>Save Changes</Text>
                }
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Stop Modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setAddModalVisible(false)}>
            <Pressable style={styles.drawer} onPress={() => {}}>
              <View style={styles.drawerHandle} />
              <Text style={styles.drawerTitle}>Add a Stop</Text>

              {/* Date picker */}
              {tripDates.length > 0 && (
                <>
                  <Text style={styles.drawerFieldLabel}>Date</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.datePillRow}
                  >
                    {tripDates.map((d) => {
                      const label = new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      });
                      return (
                        <TouchableOpacity
                          key={d}
                          style={[styles.datePill, addDate === d && styles.datePillActive]}
                          onPress={() => setAddDate(d)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.datePillText, addDate === d && styles.datePillTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* Place name */}
              <View style={styles.inputWrapper}>
                <Ionicons name="location-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.input}
                  placeholder="Place name"
                  placeholderTextColor="#9CA3AF"
                  value={addPlace}
                  onChangeText={setAddPlace}
                  autoFocus
                />
              </View>

              {/* Time picker */}
              <View style={styles.timePicker}>
                <Ionicons name="time-outline" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
                <View style={styles.timeSpinner}>
                  <TouchableOpacity onPress={() => adjustAddHour(1)} hitSlop={8} activeOpacity={0.7}>
                    <Ionicons name="chevron-up" size={16} color="#6B3FA0" />
                  </TouchableOpacity>
                  <Text style={styles.timeSpinnerValue}>{addHour}</Text>
                  <TouchableOpacity onPress={() => adjustAddHour(-1)} hitSlop={8} activeOpacity={0.7}>
                    <Ionicons name="chevron-down" size={16} color="#6B3FA0" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.timeColon}>:</Text>
                <View style={styles.timeSpinner}>
                  <TouchableOpacity onPress={() => adjustAddMinute(1)} hitSlop={8} activeOpacity={0.7}>
                    <Ionicons name="chevron-up" size={16} color="#6B3FA0" />
                  </TouchableOpacity>
                  <Text style={styles.timeSpinnerValue}>{String(addMinute).padStart(2, '0')}</Text>
                  <TouchableOpacity onPress={() => adjustAddMinute(-1)} hitSlop={8} activeOpacity={0.7}>
                    <Ionicons name="chevron-down" size={16} color="#6B3FA0" />
                  </TouchableOpacity>
                </View>
                <View style={styles.ampmRow}>
                  {(['AM', 'PM'] as const).map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.ampmBtn, addAmPm === v && styles.ampmBtnActive]}
                      onPress={() => setAddAmPm(v)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.ampmText, addAmPm === v && styles.ampmTextActive]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Category */}
              <Text style={styles.drawerFieldLabel}>Category</Text>
              <View style={styles.categoryRow}>
                {CATEGORY_OPTIONS.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryPill, addCategory === cat && styles.categoryPillActive]}
                    onPress={() => setAddCategory(cat)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.categoryPillText, addCategory === cat && styles.categoryPillTextActive]}>
                      {CATEGORY_LABELS[cat] ?? cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.confirmBtn, (!addPlace.trim() || !addDate) && styles.confirmBtnDisabled]}
                onPress={handleAddStop}
                activeOpacity={0.85}
                disabled={addSaving || !addPlace.trim() || !addDate}
              >
                {addSaving
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.confirmBtnText}>Add Stop</Text>
                }
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F8' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, fontSize: 17, fontWeight: '700', color: '#111827',
  },
  groupBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EDE9F8',
    alignItems: 'center', justifyContent: 'center',
  },

  scroll: { paddingBottom: 20 },

  heroBanner: {
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroLeft: { flex: 1, gap: 4 },
  heroEditBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 12,
  },
  heroCountdown: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 },
  heroName: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', lineHeight: 28 },
  heroDates: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  heroCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 16,
  },

  section: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: '#9CA3AF',
    letterSpacing: 0.8, marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  addStopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDE9F8',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  addStopBtnText: { fontSize: 12, fontWeight: '600', color: '#6B3FA0' },

  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  memberBubble: { alignItems: 'center', gap: 4 },
  memberAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  memberInitials: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  memberName: { fontSize: 11, color: '#6B7280', maxWidth: 48 },

  dayGroup: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  dayDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  dayContent: { flex: 1 },
  dayLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },

  stopRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12, padding: 10, marginBottom: 6,
  },
  stopIconCircle: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stopInfo: { flex: 1 },
  stopName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  stopTime: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  deleteBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  emptyItinerary: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 32, alignItems: 'center', gap: 8,
  },
  emptyItineraryText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  emptyItinerarySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 },

  actions: {
    flexDirection: 'row', gap: 12,
    marginHorizontal: 20, marginTop: 24,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    backgroundColor: '#EDE9F8',
    borderRadius: 16, paddingVertical: 14,
  },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: '#6B3FA0' },

  // Modal styles
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  drawer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  drawerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 4,
  },
  drawerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  drawerFieldLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 0.4 },
  datePillRow: { gap: 8, paddingBottom: 4 },
  datePill: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#F3F4F6',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  datePillActive: { backgroundColor: '#EDE9F8', borderColor: '#6B3FA0' },
  datePillText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  datePillTextActive: { color: '#6B3FA0' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F9FAFB', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  input: { flex: 1, fontSize: 15, color: '#111827' },
  timePicker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  timeSpinner: { alignItems: 'center', gap: 2, minWidth: 32 },
  timeSpinnerValue: { fontSize: 18, fontWeight: '700', color: '#111827' },
  timeColon: { fontSize: 20, fontWeight: '700', color: '#111827', marginHorizontal: 4 },
  ampmRow: { flexDirection: 'row', gap: 6, marginLeft: 12 },
  ampmBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, backgroundColor: '#F3F4F6',
  },
  ampmBtnActive: { backgroundColor: '#6B3FA0' },
  ampmText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  ampmTextActive: { color: '#FFFFFF' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryPill: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#F3F4F6',
  },
  categoryPillActive: { backgroundColor: '#EDE9F8' },
  categoryPillText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  categoryPillTextActive: { color: '#6B3FA0' },
  confirmBtn: {
    backgroundColor: '#6B3FA0', borderRadius: 16,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  photoCount: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  emptyMemories: {
    backgroundColor: '#F9FAFB', borderRadius: 12,
    paddingVertical: 24, alignItems: 'center', gap: 6,
  },
  emptyMemoriesText: { fontSize: 13, color: '#9CA3AF' },
  photoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
  },
  photoTile: {
    width: PHOTO_TILE, height: PHOTO_TILE,
    borderRadius: 8, backgroundColor: '#F3F4F6',
  },
});
