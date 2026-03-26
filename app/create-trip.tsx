import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { TRIP_COLORS } from '../components/TripCalendar';

// ── Calendar helpers ───────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isBetween(d: Date, start: Date, end: Date) {
  return d > start && d < end;
}
function formatDate(d: Date | null): string {
  if (!d) return '';
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

type CalendarProps = {
  startDate: Date | null;
  endDate: Date | null;
  onSelect: (d: Date) => void;
};

function InlineCalendar({ startDate, endDate, onSelect }: CalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full rows of 7
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={calStyles.calendar}>
      {/* Month nav */}
      <View style={calStyles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={calStyles.navBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color="#374151" />
        </TouchableOpacity>
        <Text style={calStyles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={calStyles.navBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={18} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Day labels */}
      <View style={calStyles.dayLabelsRow}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={calStyles.dayLabel}>{d}</Text>
        ))}
      </View>

      {/* Day grid */}
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={calStyles.weekRow}>
          {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
            if (!day) return <View key={col} style={calStyles.dayCell} />;
            const date = new Date(viewYear, viewMonth, day);
            const isStart = startDate ? sameDay(date, startDate) : false;
            const isEnd = endDate ? sameDay(date, endDate) : false;
            const inRange = startDate && endDate ? isBetween(date, startDate, endDate) : false;
            const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());

            return (
              <TouchableOpacity
                key={col}
                style={[
                  calStyles.dayCell,
                  inRange && calStyles.dayCellInRange,
                  (isStart || isEnd) && calStyles.dayCellSelected,
                  isStart && !endDate && calStyles.dayCellSelected,
                ]}
                onPress={() => !isPast && onSelect(date)}
                activeOpacity={isPast ? 1 : 0.7}
              >
                <Text style={[
                  calStyles.dayText,
                  isPast && calStyles.dayTextPast,
                  inRange && calStyles.dayTextInRange,
                  (isStart || isEnd) && calStyles.dayTextSelected,
                ]}>
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Range summary */}
      {(startDate || endDate) && (
        <View style={calStyles.rangeSummary}>
          <View style={calStyles.rangeItem}>
            <Text style={calStyles.rangeLabel}>DEPARTURE</Text>
            <Text style={calStyles.rangeValue}>{formatDate(startDate) || '—'}</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color="#9CA3AF" />
          <View style={calStyles.rangeItem}>
            <Text style={calStyles.rangeLabel}>RETURN</Text>
            <Text style={calStyles.rangeValue}>{formatDate(endDate) || '—'}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function CreateTripScreen() {
  const router = useRouter();
  const { setActiveTripId } = useApp();

  const [tripName, setTripName] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [destinationInput, setDestinationInput] = useState('');
  const [destinations, setDestinations] = useState<string[]>(['Strasbourg', 'Lucerne']);
  const [petFriendly, setPetFriendly] = useState(true);
  const [creating, setCreating] = useState(false);

  const handleDateSelect = (date: Date) => {
    if (!startDate || (startDate && endDate)) {
      // Start fresh
      setStartDate(date);
      setEndDate(null);
    } else {
      // Have start, picking end
      if (date < startDate) {
        setStartDate(date);
        setEndDate(null);
      } else if (sameDay(date, startDate)) {
        setStartDate(null);
      } else {
        setEndDate(date);
      }
    }
  };

  const addDestination = () => {
    const val = destinationInput.trim();
    if (val && !destinations.includes(val)) {
      setDestinations((prev) => [...prev, val]);
    }
    setDestinationInput('');
  };

  const removeDestination = (name: string) => {
    setDestinations((prev) => prev.filter((d) => d !== name));
  };

  const handleCreate = async () => {
    if (!tripName.trim() || creating) return;
    setCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Demo mode — skip DB
      setCreating(false);
      router.push('/invite');
      return;
    }

    const datesLabel = startDate && endDate
      ? `${formatDate(startDate)} – ${formatDate(endDate)}`
      : startDate
        ? formatDate(startDate)
        : null;

    // Pick a colour not used by any existing trip
    const { data: existingMembers } = await supabase
      .from('trip_members').select('trip_id').eq('user_id', user.id);
    const usedCount = existingMembers?.length ?? 0;
    const accentColor = TRIP_COLORS[usedCount % TRIP_COLORS.length];

    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        name: tripName.trim(),
        dates_label: datesLabel,
        created_by: user.id,
        is_active: true,
        accent_color: accentColor,
      })
      .select()
      .single();

    if (error || !trip) {
      const msg = error?.message ?? 'Unknown error';
      console.warn('Failed to create trip:', msg);
      Alert.alert('Could not create trip', msg);
      setCreating(false);
      return;
    }

    // Add creator as planner member
    await supabase.from('trip_members').insert({
      trip_id: trip.id,
      user_id: user.id,
      role: 'planner',
      display_color: '#6B3FA0',
    });

    setCreating(false);
    setActiveTripId(trip.id);
    router.push('/invite');
  };

  const dateLabel = startDate && endDate
    ? `${formatDate(startDate)} → ${formatDate(endDate)}`
    : startDate
      ? `${formatDate(startDate)} → pick end`
      : 'Select dates';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.back()}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, styles.stepDotActive]} />
            <View style={styles.stepLine} />
            <View style={styles.stepDot} />
            <View style={styles.stepLine} />
            <View style={styles.stepDot} />
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>JE</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Editorial header */}
          <View style={styles.editorialHeader}>
            <Text style={styles.badge}>YOUR JOURNEY</Text>
            <Text style={styles.heading}>Start Your{'\n'}Journey</Text>
            <Text style={styles.subheading}>
              Design your trip itinerary and invite your travel companions.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>

            {/* Trip Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Trip Name</Text>
              <TextInput
                style={styles.input}
                value={tripName}
                onChangeText={setTripName}
                placeholder="Swiss Summer Grand Tour"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Dates */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Dates</Text>

              {/* Date trigger button */}
              <TouchableOpacity
                style={[styles.dateTrigger, showCalendar && styles.dateTriggerActive]}
                onPress={() => setShowCalendar((v) => !v)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={showCalendar ? '#6B3FA0' : '#9CA3AF'}
                />
                <Text style={[styles.dateTriggerText, (startDate || endDate) && styles.dateTriggerTextSelected]}>
                  {dateLabel}
                </Text>
                <Ionicons
                  name={showCalendar ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#9CA3AF"
                />
              </TouchableOpacity>

              {/* Inline calendar */}
              {showCalendar && (
                <InlineCalendar
                  startDate={startDate}
                  endDate={endDate}
                  onSelect={handleDateSelect}
                />
              )}

              {/* Hint text when calendar is open */}
              {showCalendar && (
                <Text style={styles.calendarHint}>
                  {!startDate ? 'Tap a date to set departure' : !endDate ? 'Tap a date to set return' : 'Tap done or pick new dates'}
                </Text>
              )}

              {/* Collapse button when both dates are set */}
              {showCalendar && startDate && endDate && (
                <TouchableOpacity
                  style={styles.calendarDoneBtn}
                  onPress={() => setShowCalendar(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.calendarDoneBtnText}>Confirm Dates</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Destinations */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Destinations</Text>
              <View style={styles.destinationInputRow}>
                <Ionicons name="location-outline" size={18} color="#6B3FA0" />
                <TextInput
                  style={styles.destinationText}
                  value={destinationInput}
                  onChangeText={setDestinationInput}
                  placeholder="Add a city or region…"
                  placeholderTextColor="#9CA3AF"
                  onSubmitEditing={addDestination}
                  returnKeyType="done"
                />
                {destinationInput.trim().length > 0 && (
                  <TouchableOpacity onPress={addDestination} activeOpacity={0.7}>
                    <Ionicons name="add-circle" size={22} color="#6B3FA0" />
                  </TouchableOpacity>
                )}
              </View>

              {destinations.length > 0 && (
                <View style={styles.chipsRow}>
                  {destinations.map((dest) => (
                    <View key={dest} style={styles.chip}>
                      <Text style={styles.chipText}>{dest}</Text>
                      <TouchableOpacity onPress={() => removeDestination(dest)} activeOpacity={0.7}>
                        <Ionicons name="close" size={14} color="#6B3FA0" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Pet-friendly toggle */}
            <View style={styles.petCard}>
              <View style={styles.petLeft}>
                <View style={styles.petIconCircle}>
                  <Text style={styles.petEmoji}>🐕</Text>
                </View>
                <View style={styles.petText}>
                  <Text style={styles.petTitle}>Pet-Friendly Planning</Text>
                  <Text style={styles.petSub}>Filter for verified pet-friendly stays & transit</Text>
                </View>
              </View>
              <Switch
                value={petFriendly}
                onValueChange={setPetFriendly}
                trackColor={{ false: '#D1D5DB', true: '#6B3FA0' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Destination inspiration card */}
            <View style={styles.inspirationCard}>
              <View style={styles.inspirationImage} />
              <View style={styles.inspirationOverlay}>
                <Text style={styles.inspirationBadge}>DESTINATION INSPIRATION</Text>
                <Text style={styles.inspirationTitle}>The Alps, Switzerland</Text>
              </View>
            </View>

          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Fixed CTA */}
        <View style={styles.ctaBar}>
          <TouchableOpacity
            style={[styles.ctaBtn, (!tripName.trim() || creating) && styles.ctaBtnDisabled]}
            onPress={handleCreate}
            activeOpacity={0.85}
          >
            {creating
              ? <ActivityIndicator color="#FFFFFF" />
              : <>
                  <Text style={styles.ctaBtnText}>Create Trip</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </>
            }
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ── Calendar styles ────────────────────────────────────────────────────────────

const calStyles = StyleSheet.create({
  calendar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  dayLabelsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.3,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
  },
  dayCellInRange: {
    backgroundColor: '#EDE9F8',
    borderRadius: 0,
  },
  dayCellSelected: {
    backgroundColor: '#6B3FA0',
    borderRadius: 19,
  },
  dayText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  dayTextPast: {
    color: '#D1D5DB',
  },
  dayTextInRange: {
    color: '#6B3FA0',
    fontWeight: '600',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  rangeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  rangeItem: {
    alignItems: 'center',
    gap: 2,
  },
  rangeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
  },
  rangeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
});

// ── Screen styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F4F8',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(244,244,248,0.9)',
  },
  headerIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D1D5DB',
  },
  stepDotActive: {
    backgroundColor: '#6B3FA0',
    width: 24,
    borderRadius: 12,
  },
  stepLine: {
    width: 20,
    height: 2,
    backgroundColor: '#E5E7EB',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  scroll: {
    paddingHorizontal: 24,
  },

  editorialHeader: {
    paddingTop: 24,
    paddingBottom: 32,
    gap: 10,
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
    letterSpacing: 1.5,
  },
  heading: {
    fontSize: 40,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 48,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },

  form: {
    gap: 28,
  },
  fieldGroup: {
    gap: 10,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 2,
  },

  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    color: '#111827',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },

  // Date picker trigger
  dateTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  dateTriggerActive: {
    borderColor: '#6B3FA0',
  },
  dateTriggerText: {
    flex: 1,
    fontSize: 15,
    color: '#9CA3AF',
  },
  dateTriggerTextSelected: {
    color: '#111827',
    fontWeight: '500',
  },
  calendarHint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: -4,
  },
  calendarDoneBtn: {
    backgroundColor: '#6B3FA0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  calendarDoneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Destinations
  destinationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  destinationText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EDE9F8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B3FA0',
  },

  // Pet card
  petCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  petLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  petIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  petEmoji: { fontSize: 22 },
  petText: { flex: 1, gap: 2 },
  petTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  petSub: { fontSize: 12, color: '#6B7280', lineHeight: 16 },

  // Inspiration card
  inspirationCard: {
    height: 180,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  inspirationImage: {
    flex: 1,
    backgroundColor: '#8BAF96',
  },
  inspirationOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  inspirationBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1,
  },
  inspirationTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // CTA
  ctaBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 16,
    backgroundColor: 'rgba(244,244,248,0.95)',
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#6B3FA0',
    borderRadius: 32,
    paddingVertical: 18,
    shadowColor: '#6B3FA0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaBtnDisabled: {
    backgroundColor: '#C4B5D4',
    shadowOpacity: 0,
  },
  ctaBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
