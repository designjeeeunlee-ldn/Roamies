import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { DbTrip } from '../lib/database.types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const TRIP_COLORS = [
  '#6B3FA0', // purple
  '#E05A2B', // orange
  '#0EA5E9', // sky blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // violet
];

type TripRange = { trip: DbTrip; start: Date; end: Date; color: string };

export function parseDatesLabel(label: string): { start: Date; end: Date } | null {
  // "Mar 25, 2026 – Mar 27, 2026"  ← create-trip full format
  const full = label.match(/^(\w{3})\s+(\d+),\s*(\d{4})\s*[–\-]\s*(\w{3})\s+(\d+),\s*(\d{4})$/);
  if (full) {
    const m1 = SHORT_MONTHS[full[1]], m2 = SHORT_MONTHS[full[4]];
    if (m1 === undefined || m2 === undefined) return null;
    return { start: new Date(+full[3], m1, +full[2]), end: new Date(+full[6], m2, +full[5]) };
  }
  // "Mar 25, 2026"  ← single date
  const singleFull = label.match(/^(\w{3})\s+(\d+),\s*(\d{4})$/);
  if (singleFull) {
    const m = SHORT_MONTHS[singleFull[1]];
    if (m === undefined) return null;
    const d = new Date(+singleFull[3], m, +singleFull[2]);
    return { start: d, end: d };
  }
  // Legacy short: "Apr 2–6"
  const curYear = new Date().getFullYear();
  const same = label.match(/^(\w{3})\s+(\d+)\s*[–\-]\s*(\d+)$/);
  if (same) {
    const m = SHORT_MONTHS[same[1]];
    if (m === undefined) return null;
    return { start: new Date(curYear, m, +same[2]), end: new Date(curYear, m, +same[3]) };
  }
  // Legacy short cross-month: "Apr 2 – May 3"
  const cross = label.match(/^(\w{3})\s+(\d+)\s*[–\-]\s*(\w{3})\s+(\d+)$/);
  if (cross) {
    const m1 = SHORT_MONTHS[cross[1]], m2 = SHORT_MONTHS[cross[3]];
    if (m1 === undefined || m2 === undefined) return null;
    const y2 = m2 < m1 ? curYear + 1 : curYear;
    return { start: new Date(curYear, m1, +cross[2]), end: new Date(y2, m2, +cross[4]) };
  }
  return null;
}

type Props = {
  trips: DbTrip[];
  activeTrip: DbTrip | null;
  onTripPress: (tripId: string) => void;
};

export default function TripCalendar({ trips, activeTrip, onTripPress }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const tripRanges: TripRange[] = trips
    .flatMap((t, i) => {
      if (!t.dates_label) return [];
      const r = parseDatesLabel(t.dates_label);
      const color = TRIP_COLORS[i % TRIP_COLORS.length];
      return r ? [{ trip: t, ...r, color }] : [];
    });

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const isToday = (day: number) =>
    day === today.getDate() &&
    viewMonth === today.getMonth() &&
    viewYear === today.getFullYear();

  const getTripsForDay = (day: number): TripRange[] => {
    const d = new Date(viewYear, viewMonth, day);
    d.setHours(12); // avoid DST edge cases
    return tripRanges.filter((r) => {
      const s = new Date(r.start); s.setHours(12);
      const e = new Date(r.end); e.setHours(12);
      return d >= s && d <= e;
    });
  };

  return (
    <View style={styles.container}>
      {/* Month navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.dowRow}>
        {DOW.map((d, i) => (
          <Text key={i} style={styles.dowText}>{d}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`e-${idx}`} style={styles.cell} />;
          const todayCell = isToday(day);
          const dayTrips = getTripsForDay(day);
          return (
            <View key={idx} style={styles.cell}>
              <View style={[styles.dayCircle, todayCell && styles.todayCircle]}>
                <Text style={[styles.dayText, todayCell && styles.todayText]}>{day}</Text>
              </View>
              {dayTrips.length > 0 && (
                <View style={styles.dots}>
                  {dayTrips.slice(0, 3).map((r) => (
                    <TouchableOpacity
                      key={r.trip.id}
                      onPress={() => onTripPress(r.trip.id)}
                      style={[styles.dot, { backgroundColor: r.color }]}
                      activeOpacity={0.7}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Legend */}
      {tripRanges.length > 0 && (
        <View style={styles.legend}>
          {tripRanges.map((r) => {
            const isActive = r.trip.id === activeTrip?.id;
            return (
              <TouchableOpacity
                key={r.trip.id}
                style={[styles.legendItem, isActive && styles.legendItemActive]}
                onPress={() => onTripPress(r.trip.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.legendBar, { backgroundColor: r.color }]} />
                <View style={styles.legendInfo}>
                  <Text style={styles.legendName} numberOfLines={1}>{r.trip.name}</Text>
                  {r.trip.dates_label ? (
                    <Text style={styles.legendDates}>{r.trip.dates_label}</Text>
                  ) : null}
                </View>
                {isActive && (
                  <View style={styles.activePill}>
                    <Text style={styles.activePillText}>active</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {tripRanges.length === 0 && (
        <Text style={styles.noTripsText}>No trips with dates scheduled</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  navArrow: { fontSize: 22, color: '#6B3FA0', fontWeight: '500' },
  monthTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  dowRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dowText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%` as any,
    alignItems: 'center',
    paddingVertical: 3,
    minHeight: 46,
    justifyContent: 'flex-start',
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCircle: { backgroundColor: '#6B3FA0' },
  dayText: { fontSize: 13, fontWeight: '500', color: '#374151' },
  todayText: { color: '#FFFFFF', fontWeight: '700' },
  dots: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legend: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  legendItemActive: { backgroundColor: '#F5F3FF' },
  legendBar: {
    width: 4,
    height: 32,
    borderRadius: 2,
    flexShrink: 0,
  },
  legendInfo: { flex: 1, gap: 2 },
  legendName: { fontSize: 14, fontWeight: '600', color: '#374151' },
  legendDates: { fontSize: 12, color: '#9CA3AF' },
  activePill: {
    backgroundColor: '#EDE9F8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activePillText: { fontSize: 11, fontWeight: '700', color: '#6B3FA0' },
  noTripsText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
