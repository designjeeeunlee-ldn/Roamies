import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';

type DayStatus = 'done' | 'active' | 'upcoming';

type Day = {
  id: string;        // YYYY-MM-DD
  dayOfWeek: string;
  dayNumber: number;
  month: string;
  status: DayStatus;
};

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// Use local date to avoid DST-related UTC offset duplicates
function localDateId(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateDays(start: Date, end: Date): Day[] {
  const days: Day[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cur = new Date(start); cur.setHours(12, 0, 0, 0); // noon avoids DST midnight edge
  const endClean = new Date(end); endClean.setHours(12, 0, 0, 0);

  while (cur <= endClean) {
    const d = new Date(cur);
    const todayNoon = new Date(today); todayNoon.setHours(12, 0, 0, 0);
    const diff = d.getDate() - todayNoon.getDate() || d.getMonth() - todayNoon.getMonth() || d.getFullYear() - todayNoon.getFullYear();
    const status: DayStatus = diff < 0 ? 'done' : diff === 0 ? 'active' : 'upcoming';
    days.push({
      id: localDateId(d),
      dayOfWeek: DOW[d.getDay()],
      dayNumber: d.getDate(),
      month: MON[d.getMonth()],
      status,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// Fallback: 7-day window centred on today
function fallbackDays(): Day[] {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 2);
  const end = new Date(today);
  end.setDate(today.getDate() + 4);
  return generateDays(start, end);
}

type Props = {
  startDate?: Date | null;
  endDate?: Date | null;
  selectedId?: string | null;
  onDayPress?: (id: string) => void;
};

export default function DayStrip({ startDate, endDate, selectedId, onDayPress }: Props) {
  const days =
    startDate && endDate ? generateDays(startDate, endDate) : fallbackDays();

  // Auto-select today's pill if no explicit selection
  const todayId = localDateId(new Date());
  const activeId = selectedId ?? todayId;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {days.map((day) => {
        const isActive = day.id === activeId;
        const isDone = !isActive && day.status === 'done';

        return (
          <TouchableOpacity
            key={day.id}
            style={[styles.pill, isActive && styles.pillActive, isDone && styles.pillDone]}
            onPress={() => onDayPress?.(day.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.dayOfWeek, isActive && styles.textActive, isDone && styles.textDone]}>
              {day.dayOfWeek}
            </Text>
            <Text style={[styles.dayNumber, isActive && styles.textActive, isDone && styles.textDone]}>
              {day.dayNumber}
            </Text>
            {/* Show month label when it changes (first day or new month) */}
            <Text style={[styles.monthLabel, isActive && styles.textActive, isDone && styles.textDone]}>
              {day.month}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    minWidth: 52,
  },
  pillActive: {
    backgroundColor: '#6B3FA0',
    borderRadius: 18,
  },
  pillDone: {
    opacity: 0.5,
  },
  dayOfWeek: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dayNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  monthLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: '#C4B5D4',
    marginTop: 1,
    letterSpacing: 0.3,
  },
  textActive: {
    color: '#FFFFFF',
  },
  textDone: {
    color: '#C4B5D4',
  },
});
