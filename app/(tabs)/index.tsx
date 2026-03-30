import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DayStrip from '@/components/DayStrip';
import FlashCard, { Stop } from '@/components/FlashCard';
import FlipCard from '@/components/FlipCard';
import { useApp } from '../../context/AppContext';
import { savePhotoToDevice } from '../../lib/useSavePhoto';
import TripCalendar, { parseDatesLabel, TRIP_COLORS } from '../../components/TripCalendar';
import ScreenHeader from '../../components/ScreenHeader';
import { formatTripDates, tripCountdown } from '../../lib/dateFormat';


type StopState = 'upcoming' | 'done' | 'skipped';

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food',
  sight: 'Sightseeing',
  travel: 'Travel',
  hotel: 'Hotel',
  free: 'Free time',
  spa: 'Hot spring',
  wine: 'Wine',
};

const CATEGORY_OPTIONS = ['sight', 'food', 'hotel', 'travel', 'spa', 'free'];

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h} hr` : `${h.toFixed(1)} hr`;
}

export default function TodayScreen() {
  const router = useRouter();
  const {
    activeTrip,
    allTrips,
    tripLoading,
    addStop: saveStop,
    setActiveTripId,
    profile,
    members,
    loadStopsForDate,
    tripPhotos,
    uploadPhoto,
  } = useApp();

  const [localStops, setLocalStops] = useState<Stop[]>([]);
  const [stopStates, setStopStates] = useState<Record<string, StopState>>({});

  const hasRealTrip = !!activeTrip && !tripLoading;

  // Parse active trip dates for DayStrip
  const tripDateRange = hasRealTrip && activeTrip?.dates_label
    ? parseDatesLabel(activeTrip.dates_label)
    : null;
  const tripStartDate = tripDateRange ? new Date(tripDateRange.start) : null;
  const tripEndDate   = tripDateRange ? new Date(tripDateRange.end)   : null;

  // Selected day in DayStrip (defaults to today)
  const todayIso = new Date().toISOString().slice(0, 10);
  const [selectedDay, setSelectedDay] = useState<string>(todayIso);

  // Date-specific stops fetched from DB
  const [dateStops, setDateStops] = useState<Stop[]>([]);

  const refreshStops = useCallback(() => {
    if (!hasRealTrip) return;
    loadStopsForDate(selectedDay).then((result) => {
      setDateStops(result as unknown as Stop[]);
    });
  }, [selectedDay, activeTrip?.id, hasRealTrip]);

  // Re-fetch on selectedDay / trip change
  useEffect(() => { refreshStops(); }, [refreshStops]);

  // Re-fetch whenever Today tab comes back into focus (e.g. after adding stop from trip-detail)
  useFocusEffect(useCallback(() => { refreshStops(); }, [refreshStops]));

  // Use date-specific stops for real trips, demo data otherwise
  const stops: Stop[] = hasRealTrip ? dateStops : localStops;

  // Add stop modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newPlace, setNewPlace] = useState('');
  const [timeHour, setTimeHour] = useState(9);
  const [timeMinute, setTimeMinute] = useState(0);
  const [timeAmPm, setTimeAmPm] = useState<'AM' | 'PM'>('AM');
  const [newCategory, setNewCategory] = useState('sight');

  const formattedTime = `${timeHour}:${String(timeMinute).padStart(2, '0')} ${timeAmPm}`;
  const adjustHour = (d: 1 | -1) => setTimeHour(h => h + d === 0 ? 12 : h + d === 13 ? 1 : h + d);
  const adjustMinute = (d: 1 | -1) => setTimeMinute(m => (m + d * 5 + 60) % 60);
  const [notifyBanner, setNotifyBanner] = useState(false);
  const [tipOpen, setTipOpen] = useState(true);
  const [expandedTip, setExpandedTip] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState(false);

  // Photo upload state
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [pendingStopId, setPendingStopId] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);

  // D-Day / Day-X from shared dateFormat util
  const countdown = tripCountdown(activeTrip?.dates_label);

  // Is the user currently mid-trip? (today falls within any trip's date range)
  const isCurrentlyTraveling = allTrips.some((t) => {
    if (!t.dates_label) return false;
    const r = parseDatesLabel(t.dates_label);
    if (!r) return false;
    const s = new Date(r.start); s.setHours(0, 0, 0, 0);
    const e = new Date(r.end);   e.setHours(23, 59, 59, 999);
    return todayMidnight >= s && todayMidnight <= e;
  });

  // Plan section title: "Today's Plan" when actively travelling, else "Wed, Mar 25's plan"
  const planTitle = (() => {
    if (isCurrentlyTraveling && selectedDay === todayIso) return "Today's Plan";
    const d = new Date(selectedDay + 'T12:00:00');
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    return `${dow}, ${mon} ${d.getDate()}'s plan`;
  })();

  // D-Day: find the nearest upcoming trip with a parseable start date
  const dDayInfo = allTrips
    .map((trip, i) => {
      if (!trip.dates_label) return null;
      const r = parseDatesLabel(trip.dates_label);
      if (!r) return null;
      const start = new Date(r.start); start.setHours(0, 0, 0, 0);
      const diff = Math.round((start.getTime() - todayMidnight.getTime()) / 86400000);
      return { trip, diff, color: TRIP_COLORS[i % TRIP_COLORS.length] };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.diff >= 0)
    .sort((a, b) => a.diff - b.diff)[0] ?? null;

  // For real trips every stop starts as 'upcoming' (state is session-only)
  const upcomingStops = stops.filter((s) => (stopStates[s.id] ?? 'upcoming') === 'upcoming');
  const currentStop = upcomingStops[0];
  const nextStop = upcomingStops[1];

  const markDone = () => {
    if (!currentStop) return;
    setStopStates((prev) => ({ ...prev, [currentStop.id]: 'done' }));
  };

  const markSkipped = () => {
    if (!currentStop) return;
    setStopStates((prev) => ({ ...prev, [currentStop.id]: 'skipped' }));
  };

  const restore = (id: string) => {
    setStopStates((prev) => ({ ...prev, [id]: 'upcoming' }));
  };

  const handleAddStop = async () => {
    if (!newPlace.trim()) return;
    const newStop = {
      time: formattedTime,
      place_name: newPlace.trim(),
      category: newCategory,
      description: 'Added manually',
      hours_today: 'unknown' as const,
      duration_minutes: 60,
      origin: 'user_added' as const,
      pet_friendly: false,
      sources: [] as [],
    };

    if (hasRealTrip) {
      await saveStop(newStop, selectedDay);
      loadStopsForDate(selectedDay).then((result) => setDateStops(result as unknown as Stop[]));
    } else {
      const id = `stop-custom-${Date.now()}`;
      setLocalStops((prev) => [...prev, { ...newStop, id }]);
      setStopStates((prev) => ({ ...prev, [id]: 'upcoming' }));
    }

    setNewPlace('');
    setTimeHour(9);
    setTimeMinute(0);
    setTimeAmPm('AM');
    setNewCategory('sight');
    setAddModalVisible(false);
    setNotifyBanner(true);
    setTimeout(() => setNotifyBanner(false), 3000);
  };

  const handlePickPhoto = async () => {
    if (tripLoading) return; // wait for trips to finish loading
    if (!activeTrip) {
      Alert.alert('No active trip', 'Create or select a trip before adding memories.');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingPhotoUri(result.assets[0].uri);
      setPendingStopId(null);
      setPhotoModalVisible(true);
    }
  };

  const handleUploadPhoto = async () => {
    if (!pendingPhotoUri) return;
    setPhotoUploading(true);
    await uploadPhoto(pendingPhotoUri, selectedDay, pendingStopId);
    setPhotoUploading(false);
    setPhotoModalVisible(false);
    setPendingPhotoUri(null);
    setPendingStopId(null);
  };

  // Photos for selected day
  const dayPhotos = tripPhotos.filter((p) => p.tripDate === selectedDay);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title={activeTrip?.name ?? 'Roamies'}
        badge={countdown?.text}
        badgeActive={countdown?.active}
        rightIcon="camera-outline"
        onRightPress={handlePickPhoto}
        avatarLabel={profile?.display_name
          ? profile.display_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
          : 'ME'}
        onAvatarPress={() => router.push('/(tabs)/me')}
      />

      {/* Trip status banner — shown only while mid-trip */}
      {isCurrentlyTraveling && activeTrip && (
        <View style={styles.statusBannerRow}>
          <View style={styles.statusBanner}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText} numberOfLines={1}>
              {countdown?.text} · {activeTrip.name}
            </Text>
          </View>
          {/* Live location bubbles — tap to open map */}
          <TouchableOpacity
            style={styles.locationRow}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/map')}
          >
            {members.slice(0, 3).map((m) => (
              <View key={m.id} style={[styles.locationAvatar, { backgroundColor: m.color, marginLeft: -6 }]}>
                <Text style={styles.locationAvatarText}>{m.initials}</Text>
                <View style={styles.locationLiveDot} />
              </View>
            ))}
            <View style={styles.locationMapBtn}>
              <Ionicons name="location" size={13} color="#6B3FA0" />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Day strip / Calendar toggle row */}
      <View style={styles.dayStripRow}>
        <View style={{ flex: 1 }}>
          <DayStrip
            startDate={tripStartDate}
            endDate={tripEndDate}
            selectedId={selectedDay}
            onDayPress={setSelectedDay}
          />
        </View>
        <TouchableOpacity
          style={[styles.calendarToggleBtn, calendarView && styles.calendarToggleBtnActive]}
          onPress={() => setCalendarView((v) => !v)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={calendarView ? 'list-outline' : 'calendar-outline'}
            size={20}
            color={calendarView ? '#FFFFFF' : '#6B3FA0'}
          />
        </TouchableOpacity>
      </View>

      {/* Group notified banner */}
      {notifyBanner && (
        <View style={styles.notifyBanner}>
          <Ionicons name="notifications" size={15} color="#FFFFFF" />
          <Text style={styles.notifyText}>Group notified of your new stop</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Calendar view */}
        {calendarView && (
          <TripCalendar
            trips={allTrips}
            activeTrip={activeTrip}
            onTripPress={(id) => {
              setActiveTripId(id);
              setCalendarView(false);
              router.push('/(tabs)/group');
            }}
          />
        )}

        {/* Empty state */}
        {stops.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconRing}>
              <Ionicons name={hasRealTrip ? 'cafe-outline' : 'map-outline'} size={36} color="#6B3FA0" />
            </View>

            {hasRealTrip ? (
              /* Trip exists but no stops today */
              <>
                <Text style={styles.emptyTitle}>Living my real life today</Text>
                <Text style={styles.emptySub}>No stops on the agenda. Sometimes that's the whole vibe.</Text>
              </>
            ) : dDayInfo ? (
              /* No active trip but upcoming trip exists — show D-Day */
              <>
                <Text style={styles.emptyTitle}>
                  {dDayInfo.diff === 0 ? 'Trip starts today!' : `${dDayInfo.trip.name} in ${dDayInfo.diff} day${dDayInfo.diff === 1 ? '' : 's'}`}
                </Text>
                <View style={[styles.dDayBadge, { backgroundColor: dDayInfo.color + '22' }]}>
                  <Text style={[styles.dDayBadgeText, { color: dDayInfo.color }]}>
                    {dDayInfo.diff === 0 ? 'D-Day' : `D-${dDayInfo.diff}`}
                  </Text>
                </View>
                <Text style={styles.emptySub}>Tap the trip below to keep planning.</Text>
              </>
            ) : (
              /* No trip at all */
              <>
                <Text style={styles.emptyTitle}>No trips planned yet</Text>
                <Text style={styles.emptySub}>Start planning your next adventure and your group will follow along in real time.</Text>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={() => router.push('/create-trip')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="airplane-outline" size={18} color="#6B3FA0" />
                  <Text style={styles.emptyAddBtnText}>Create a new trip</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Next up — show upcoming trips (not past) */}
            {allTrips.length > 0 && (() => {
              const upcoming = allTrips
                .map((t, i) => ({ trip: t, color: TRIP_COLORS[i % TRIP_COLORS.length], cd: tripCountdown(t.dates_label) }))
                .filter(({ cd }) => cd !== null);
              if (upcoming.length === 0) return null;
              return (
                <View style={styles.upcomingTrips}>
                  <Text style={styles.upcomingLabel}>NEXT UP</Text>
                  {upcoming.map(({ trip, color, cd }) => (
                    <TouchableOpacity
                      key={trip.id}
                      style={styles.upcomingRow}
                      activeOpacity={0.8}
                      onPress={() => {
                        setActiveTripId(trip.id);
                        router.push({ pathname: '/trip-detail', params: { id: trip.id } });
                      }}
                    >
                      <View style={[styles.upcomingBar, { backgroundColor: color }]} />
                      <View style={styles.upcomingInfo}>
                        <Text style={styles.upcomingName}>{trip.name}</Text>
                        {trip.dates_label
                          ? <Text style={styles.upcomingDates}>{formatTripDates(trip.dates_label)}</Text>
                          : null}
                      </View>
                      <View style={[styles.upcomingActivePill, { backgroundColor: color + '22' }]}>
                        <Text style={[styles.upcomingActivePillText, { color }]}>{cd!.text}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}
          </View>
        )}

        {/* Card stack */}
        <View style={styles.stackArea}>
          {currentStop ? (
            <>
              {nextStop && (
                <View style={styles.backCard} pointerEvents="none">
                  <FlashCard stop={nextStop} onConfirm={() => {}} onSkip={() => {}} showActions={false} />
                </View>
              )}
              <View style={styles.frontCardWrapper}>
                <FlipCard
                  key={currentStop.id}
                  stop={currentStop}
                  onDone={markDone}
                  onSkip={markSkipped}
                />
              </View>
            </>
          ) : null}
        </View>

        {/* Day plan list */}
        <View style={styles.planSection}>
            <View style={styles.planHeader}>
              <Text style={styles.planTitle}>{planTitle}</Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => setAddModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color="#6B3FA0" />
                <Text style={styles.addBtnText}>Add stop</Text>
              </TouchableOpacity>
            </View>

            {[...stops].sort((a, b) => parseTimeMinutes(a.time) - parseTimeMinutes(b.time)).map((stop, index) => {
              const state = stopStates[stop.id];
              const isCurrent = currentStop?.id === stop.id;
              const isRestorable = state === 'done' || state === 'skipped';

              return (
                <View key={stop.id} style={styles.planItem}>
                  {/* Timeline column */}
                  <View style={styles.timelineCol}>
                    <View style={[styles.stateIcon, stateIconStyle(state, isCurrent)]}>
                      {state === 'done' && <Ionicons name="checkmark" size={14} color="#fff" />}
                      {state === 'skipped' && <Ionicons name="close" size={14} color="#9CA3AF" />}
                      {state === 'upcoming' && isCurrent && <View style={styles.currentDot} />}
                      {state === 'upcoming' && !isCurrent && <View style={styles.upcomingDot} />}
                    </View>
                    {index < stops.length - 1 && (
                      <View style={[styles.connector, state === 'done' && styles.connectorDone]} />
                    )}
                  </View>

                  {/* Content */}
                  <View style={[styles.planContent, state === 'skipped' && styles.planContentSkipped]}>
                    <View style={styles.planRow}>
                      <Text style={[styles.planTime, state !== 'upcoming' && styles.textMuted]}>
                        {stop.time}
                      </Text>
                      <Text style={styles.planCategory}>
                        {CATEGORY_LABELS[stop.category] ?? stop.category}
                      </Text>

                      {state === 'done' && (
                        <View style={styles.doneBadge}>
                          <Text style={styles.doneBadgeText}>Done</Text>
                        </View>
                      )}
                      {state === 'skipped' && (
                        <View style={styles.skippedBadge}>
                          <Text style={styles.skippedBadgeText}>Skipped</Text>
                        </View>
                      )}
                      {isCurrent && (
                        <View style={styles.nowBadge}>
                          <Text style={styles.nowBadgeText}>Now</Text>
                        </View>
                      )}
                      {stop.origin === 'user_added' && stop.id.startsWith('stop-custom') && (
                        <View style={styles.manualBadge}>
                          <Text style={styles.manualBadgeText}>Added by you</Text>
                        </View>
                      )}

                      {isRestorable && (
                        <TouchableOpacity
                          style={styles.restoreBtn}
                          onPress={() => restore(stop.id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="refresh" size={13} color="#6B3FA0" />
                          <Text style={styles.restoreText}>Undo</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text style={[styles.planName, state === 'skipped' && styles.planNameSkipped]}>
                      {stop.place_name}
                    </Text>
                    <Text style={[styles.planMeta, state !== 'upcoming' && styles.textMuted]}>
                      {formatDuration(stop.duration_minutes)}
                      {stop.cost && stop.cost !== 'free' ? ` · ${stop.cost}` : ' · Free'}
                    </Text>
                    {/* Photo thumbnails for this stop */}
                    {(() => {
                      const stopPhotos = tripPhotos.filter(
                        (p) => p.stopId === stop.id && p.tripDate === selectedDay
                      );
                      if (stopPhotos.length === 0) return null;
                      return (
                        <View style={styles.stopThumbnailRow}>
                          {stopPhotos.slice(0, 4).map((p) => (
                            <Image
                              key={p.id}
                              source={{ uri: p.publicUrl }}
                              style={styles.stopThumbnail}
                            />
                          ))}
                        </View>
                      );
                    })()}
                  </View>
                </View>
              );
            })}
          </View>

        {/* Memories tile — shown when trip is active */}
        {hasRealTrip && (
          <View style={styles.memoriesSection}>
            <View style={styles.memoriesHeader}>
              <Text style={styles.memoriesTitle}>MEMORIES</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/photos')} activeOpacity={0.7}>
                <Text style={styles.memoriesSeeAll}>See all →</Text>
              </TouchableOpacity>
            </View>
            {dayPhotos.length === 0 ? (
              <View style={styles.memoriesEmpty}>
                <Ionicons name="images-outline" size={28} color="#D1D5DB" />
                <Text style={styles.memoriesEmptyText}>No photos yet for this day</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.memoriesScroll}
              >
                {dayPhotos.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onLongPress={() => savePhotoToDevice(p.publicUrl)}
                    delayLongPress={400}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri: p.publicUrl }} style={styles.memoryThumb} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Travel Tip */}
        <View style={styles.tipSection}>
            <TouchableOpacity
              style={styles.tipHeader}
              onPress={() => setTipOpen((v) => !v)}
              activeOpacity={0.8}
            >
              <View style={styles.tipHeaderLeft}>
                <Ionicons name="bulb-outline" size={15} color="#6B3FA0" />
                <Text style={styles.tipHeaderTitle}>Travel Tip</Text>
                <Text style={styles.tipHeaderSub}>For today · Rhine Falls & Lucerne</Text>
              </View>
              <Ionicons name={tipOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
            </TouchableOpacity>

            {tipOpen && (
              <View style={styles.tipTiles}>
                {[
                  {
                    id: 'headsup',
                    label: 'HEADS UP',
                    icon: 'warning-outline',
                    color: '#6B3FA0',
                    bg: '#EDE9F8',
                    short: 'Rhine Falls gets crowded after 10 AM on weekends.',
                    detail: 'Arrive before 9:30 AM to beat tour groups. Park at Schloss Laufen — it gives the best top-down view. Boat tickets sell out fast; buy online in advance.',
                  },
                  {
                    id: 'weather',
                    label: 'WEATHER',
                    icon: 'partly-sunny-outline',
                    color: '#0369A1',
                    bg: '#E0F2FE',
                    short: '12°C with wind. Layers recommended.',
                    detail: 'Morning fog clears by 10 AM near the falls. Wind chill near the waterfall spray can feel 4–5°C colder. Lucerne is milder in the afternoon — expect 15°C by 4 PM.',
                  },
                  {
                    id: 'transport',
                    label: 'TRANSPORT',
                    icon: 'train-outline',
                    color: '#065F46',
                    bg: '#D1FAE5',
                    short: 'Swiss Half Fare Card saves 50% on today\'s trains.',
                    detail: 'Rhine Falls → Lucerne via Schaffhausen takes ~1h 45m. Next direct train departs at 13:12 from Neuhausen. Half Fare Card covers regional buses too — use it for the Lucerne harbour ferry.',
                  },
                ].map((tip) => {
                  const isOpen = expandedTip === tip.id;
                  return (
                    <TouchableOpacity
                      key={tip.id}
                      style={[styles.tipTile, { backgroundColor: tip.bg }]}
                      onPress={() => setExpandedTip(isOpen ? null : tip.id)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.tipTileRow}>
                        <View style={[styles.tipTileIcon, { backgroundColor: tip.color + '22' }]}>
                          <Ionicons name={tip.icon as any} size={14} color={tip.color} />
                        </View>
                        <Text style={[styles.tipTileLabel, { color: tip.color }]}>{tip.label}</Text>
                        <Ionicons
                          name={isOpen ? 'chevron-up' : 'chevron-down'}
                          size={13}
                          color={tip.color}
                          style={{ marginLeft: 'auto' }}
                        />
                      </View>
                      <Text style={styles.tipTileShort}>{tip.short}</Text>
                      {isOpen && (
                        <Text style={styles.tipTileDetail}>{tip.detail}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

        <View style={{ height: 32 }} />
      </ScrollView>

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
              <Text style={styles.drawerSub}>
                Adding a stop manually will notify everyone in your group.
              </Text>

              {/* Place name */}
              <View style={styles.inputWrapper}>
                <Ionicons name="location-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.input}
                  placeholder="Place name"
                  placeholderTextColor="#9CA3AF"
                  value={newPlace}
                  onChangeText={setNewPlace}
                  autoFocus
                />
              </View>

              {/* Time picker */}
              <View style={styles.timePicker}>
                <Ionicons name="time-outline" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />

                {/* Hour */}
                <View style={styles.timeSpinner}>
                  <TouchableOpacity onPress={() => adjustHour(1)} hitSlop={8} activeOpacity={0.7}>
                    <Ionicons name="chevron-up" size={16} color="#6B3FA0" />
                  </TouchableOpacity>
                  <Text style={styles.timeSpinnerValue}>{timeHour}</Text>
                  <TouchableOpacity onPress={() => adjustHour(-1)} hitSlop={8} activeOpacity={0.7}>
                    <Ionicons name="chevron-down" size={16} color="#6B3FA0" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.timeColon}>:</Text>

                {/* Minute */}
                <View style={styles.timeSpinner}>
                  <TouchableOpacity onPress={() => adjustMinute(1)} hitSlop={8} activeOpacity={0.7}>
                    <Ionicons name="chevron-up" size={16} color="#6B3FA0" />
                  </TouchableOpacity>
                  <Text style={styles.timeSpinnerValue}>{String(timeMinute).padStart(2, '0')}</Text>
                  <TouchableOpacity onPress={() => adjustMinute(-1)} hitSlop={8} activeOpacity={0.7}>
                    <Ionicons name="chevron-down" size={16} color="#6B3FA0" />
                  </TouchableOpacity>
                </View>

                {/* AM / PM */}
                <View style={styles.ampmRow}>
                  {(['AM', 'PM'] as const).map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.ampmBtn, timeAmPm === v && styles.ampmBtnActive]}
                      onPress={() => setTimeAmPm(v)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.ampmText, timeAmPm === v && styles.ampmTextActive]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Category picker */}
              <Text style={styles.categoryLabel}>Category</Text>
              <View style={styles.categoryRow}>
                {CATEGORY_OPTIONS.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryPill, newCategory === cat && styles.categoryPillActive]}
                    onPress={() => setNewCategory(cat)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.categoryPillText, newCategory === cat && styles.categoryPillTextActive]}>
                      {CATEGORY_LABELS[cat] ?? cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Notify note */}
              <View style={styles.notifyNote}>
                <Ionicons name="notifications-outline" size={15} color="#6B3FA0" />
                <Text style={styles.notifyNoteText}>
                  Your group will receive a push notification when you add this stop.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.confirmBtn, !newPlace.trim() && styles.confirmBtnDisabled]}
                onPress={handleAddStop}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>Add & Notify Group</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Photo Tag Modal */}
      <Modal
        visible={photoModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPhotoModalVisible(false)}>
          <Pressable style={styles.drawer} onPress={() => {}}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>Add to Memories</Text>

            {/* Photo preview */}
            {pendingPhotoUri && (
              <Image source={{ uri: pendingPhotoUri }} style={styles.photoModalPreview} />
            )}

            {/* Tag to a stop */}
            {stops.length > 0 && (
              <>
                <Text style={styles.stopPickerLabel}>Tag to a stop (optional)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.stopPickerScroll}
                >
                  <TouchableOpacity
                    style={[styles.stopPickerOption, pendingStopId === null && styles.stopPickerOptionActive]}
                    onPress={() => setPendingStopId(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.stopPickerOptionText, pendingStopId === null && styles.stopPickerOptionTextActive]}>
                      No tag
                    </Text>
                  </TouchableOpacity>
                  {stops.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.stopPickerOption, pendingStopId === s.id && styles.stopPickerOptionActive]}
                      onPress={() => setPendingStopId(s.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.stopPickerOptionText, pendingStopId === s.id && styles.stopPickerOptionTextActive]}>
                        {s.place_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <TouchableOpacity
              style={styles.photoUploadBtn}
              onPress={handleUploadPhoto}
              activeOpacity={0.85}
              disabled={photoUploading}
            >
              {photoUploading
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.photoUploadBtnText}>Save to Memories</Text>
              }
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function parseTimeMinutes(time: string | undefined): number {
  if (!time || time === '--:--') return Infinity;
  const m = time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return Infinity;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function stateIconStyle(state: StopState, isCurrent: boolean) {
  if (state === 'done') return styles.stateIconDone;
  if (state === 'skipped') return styles.stateIconSkipped;
  if (isCurrent) return styles.stateIconCurrent;
  return styles.stateIconUpcoming;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEEEF6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 0,
  },
  tripTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  wordmark: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Notify banner
  notifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: '#6B3FA0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  notifyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  scroll: {
    paddingTop: 32,
    paddingBottom: 16,
  },

  // Card stack
  stackArea: {
    marginBottom: 8,
    overflow: 'visible',
  },
  frontCardWrapper: {
    zIndex: 1,
  },
  backCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 0,
    transform: [{ scale: 0.95 }, { translateY: 16 }],
    opacity: 0.7,
  },

  // All done
  doneCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  doneTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  doneSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', paddingHorizontal: 24 },

  // Plan section
  planSection: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9F8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B3FA0',
  },

  // Plan item
  planItem: {
    flexDirection: 'row',
    gap: 14,
    paddingBottom: 20,
  },

  // Timeline
  timelineCol: { alignItems: 'center', width: 28, flexShrink: 0 },
  stateIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stateIconDone: { backgroundColor: '#6B3FA0' },
  stateIconSkipped: { backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB' },
  stateIconCurrent: { backgroundColor: '#EDE9F8', borderWidth: 2, borderColor: '#6B3FA0' },
  stateIconUpcoming: { backgroundColor: '#F3F4F6' },
  currentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6B3FA0' },
  upcomingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  connector: { flex: 1, width: 2, backgroundColor: '#E5E7EB', marginTop: 2 },
  connectorDone: { backgroundColor: '#C4B5D4' },

  // Plan content
  planContent: { flex: 1, gap: 2, paddingBottom: 4 },
  planContentSkipped: { opacity: 0.55 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  planTime: { fontSize: 12, fontWeight: '700', color: '#6B3FA0' },
  planCategory: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  planName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  planNameSkipped: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  planMeta: { fontSize: 12, color: '#6B7280' },
  textMuted: { color: '#9CA3AF' },

  // Badges
  doneBadge: { backgroundColor: '#F3E8FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  doneBadgeText: { fontSize: 11, fontWeight: '600', color: '#6B3FA0' },
  skippedBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  skippedBadgeText: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  nowBadge: { backgroundColor: '#6B3FA0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  nowBadgeText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  manualBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  manualBadgeText: { fontSize: 11, fontWeight: '600', color: '#92400E' },

  restoreBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD6F3',
  },
  restoreText: { fontSize: 11, fontWeight: '600', color: '#6B3FA0' },

  // Add stop modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  drawer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 14,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 4,
  },
  drawerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  drawerSub: { fontSize: 13, color: '#6B7280', lineHeight: 18, marginTop: -6 },

  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  timeSpinner: {
    alignItems: 'center',
    gap: 2,
    minWidth: 36,
  },
  timeSpinnerValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 28,
  },
  timeColon: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  ampmRow: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 8,
  },
  ampmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  ampmBtnActive: {
    backgroundColor: '#6B3FA0',
  },
  ampmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  ampmTextActive: {
    color: '#FFFFFF',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  input: { flex: 1, fontSize: 15, color: '#111827' },

  categoryLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: -4 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  categoryPillActive: { borderColor: '#6B3FA0', backgroundColor: '#EDE9F8' },
  categoryPillText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  categoryPillTextActive: { color: '#6B3FA0' },

  notifyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EDE9F8',
    borderRadius: 12,
    padding: 12,
  },
  notifyNoteText: { flex: 1, fontSize: 13, color: '#6B3FA0', lineHeight: 18 },

  confirmBtn: {
    backgroundColor: '#6B3FA0',
    borderRadius: 32,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#6B3FA0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  confirmBtnDisabled: { backgroundColor: '#C4B5D4', shadowOpacity: 0 },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Empty state
  emptyState: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 44,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
  },
  emptyIconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  emptySub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    backgroundColor: '#EDE9F8',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  emptyAddBtnText: { fontSize: 15, fontWeight: '700', color: '#6B3FA0' },
  dDayBadge: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  dDayBadgeText: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },

  // Travel Tip
  tipSection: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  tipHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  tipHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  tipHeaderSub: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  tipTiles: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  tipTile: {
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  tipTileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tipTileIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTileLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  tipTileShort: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    lineHeight: 18,
  },
  tipTileDetail: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    marginTop: 2,
  },

  // Day strip row
  dayStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
  },
  calendarToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  calendarToggleBtnActive: {
    backgroundColor: '#6B3FA0',
  },

  // Upcoming trips (empty state)
  upcomingTrips: {
    width: '100%',
    marginTop: 16,
    gap: 8,
  },
  upcomingLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingVertical: 12,
    paddingRight: 14,
    overflow: 'hidden',
  },
  upcomingRowActive: {
    backgroundColor: '#F5F3FF',
  },
  upcomingBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  upcomingInfo: { flex: 1, gap: 2 },
  upcomingName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  upcomingDates: { fontSize: 12, color: '#9CA3AF' },
  upcomingActivePill: {
    backgroundColor: '#EDE9F8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  upcomingActivePillText: { fontSize: 11, fontWeight: '700', color: '#6B3FA0' },

  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTripName: { fontSize: 17, fontWeight: '800', color: '#111827', flexShrink: 1 },
  countdownPill: {
    backgroundColor: '#EDE9F8',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  countdownPillActive: { backgroundColor: '#6B3FA0' },
  countdownText: { fontSize: 11, fontWeight: '700', color: '#6B3FA0' },
  countdownTextActive: { color: '#FFFFFF' },

  statusBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 4,
  },
  statusBanner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#6B3FA0',
    borderRadius: 12,
  },
  statusDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#FFFFFF',
    opacity: 0.8,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  locationAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#F4F4F8',
  },
  locationAvatarText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
  locationLiveDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#22C55E',
    borderWidth: 1.5, borderColor: '#F4F4F8',
  },
  locationMapBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#EDE9F8',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 2,
  },

  // Stop photo thumbnails
  stopThumbnailRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  stopThumbnail: {
    width: 44, height: 44,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },

  // Memories section
  memoriesSection: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  memoriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  memoriesTitle: {
    fontSize: 13, fontWeight: '800', color: '#111827', letterSpacing: 0.3,
  },
  memoriesSeeAll: {
    fontSize: 12, fontWeight: '600', color: '#6B3FA0',
  },
  memoriesScroll: {
    gap: 8,
  },
  memoryThumb: {
    width: 80, height: 80,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  memoriesEmpty: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  memoriesEmptyText: {
    fontSize: 13, color: '#9CA3AF', fontWeight: '500',
  },

  // Photo tag modal
  photoModalPreview: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    marginBottom: 16,
  },
  stopPickerLabel: {
    fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8,
  },
  stopPickerScroll: {
    gap: 8,
    marginBottom: 16,
  },
  stopPickerOption: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  stopPickerOptionActive: {
    backgroundColor: '#EDE9F8',
    borderColor: '#6B3FA0',
  },
  stopPickerOptionText: {
    fontSize: 13, fontWeight: '600', color: '#374151',
  },
  stopPickerOptionTextActive: {
    color: '#6B3FA0',
  },
  photoUploadBtn: {
    backgroundColor: '#6B3FA0',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  photoUploadBtnText: {
    fontSize: 15, fontWeight: '700', color: '#FFFFFF',
  },
});
