import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ── Calendar helpers ────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isBetween(d: Date, start: Date, end: Date) {
  return d > start && d < end;
}

export type InlineCalendarProps = {
  startDate: Date | null;
  endDate: Date | null;
  onSelectStart: (d: Date) => void;
  onSelectEnd: (d: Date) => void;
  selectingStart: boolean;
  onToggleSelecting: () => void;
};

export function formatCalendarDate(d: Date | null): string {
  if (!d) return '';
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function InlineCalendar({
  startDate,
  endDate,
  onSelectStart,
  onSelectEnd,
  selectingStart,
  onToggleSelecting,
}: InlineCalendarProps) {
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
  while (cells.length % 7 !== 0) cells.push(null);

  const handleDayPress = (date: Date) => {
    if (selectingStart) {
      onSelectStart(date);
    } else {
      if (startDate && date < startDate) {
        onSelectStart(date);
      } else if (startDate && sameDay(date, startDate)) {
        // deselect
        onSelectStart(date);
      } else {
        onSelectEnd(date);
      }
    }
  };

  return (
    <View style={calStyles.calendar}>
      {/* Selecting toggle */}
      <View style={calStyles.selectingToggle}>
        <TouchableOpacity
          style={[calStyles.toggleBtn, selectingStart && calStyles.toggleBtnActive]}
          onPress={() => { if (!selectingStart) onToggleSelecting(); }}
          activeOpacity={0.7}
        >
          <Text style={[calStyles.toggleBtnText, selectingStart && calStyles.toggleBtnTextActive]}>
            Departure
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[calStyles.toggleBtn, !selectingStart && calStyles.toggleBtnActive]}
          onPress={() => { if (selectingStart) onToggleSelecting(); }}
          activeOpacity={0.7}
        >
          <Text style={[calStyles.toggleBtnText, !selectingStart && calStyles.toggleBtnTextActive]}>
            Return
          </Text>
        </TouchableOpacity>
      </View>

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
                ]}
                onPress={() => !isPast && handleDayPress(date)}
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
            <Text style={calStyles.rangeValue}>{formatCalendarDate(startDate) || '—'}</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color="#9CA3AF" />
          <View style={calStyles.rangeItem}>
            <Text style={calStyles.rangeLabel}>RETURN</Text>
            <Text style={calStyles.rangeValue}>{formatCalendarDate(endDate) || '—'}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

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
  selectingToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  toggleBtnActive: {
    backgroundColor: '#EDE9F8',
    borderColor: '#6B3FA0',
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  toggleBtnTextActive: {
    color: '#6B3FA0',
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
