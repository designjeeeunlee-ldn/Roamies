import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useRouter } from 'expo-router';
import { TRIP_COLORS } from './TripCalendar';

export default function TripSwitcher() {
  const { activeTrip, allTrips, setActiveTripId } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <Ionicons name="map-outline" size={14} color="#6B3FA0" />
        <Text style={styles.triggerText}>Your trips</Text>
        <Ionicons name="chevron-down" size={14} color="#6B3FA0" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" presentationStyle="overFullScreen">
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Your Trips</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {allTrips.length === 0 && (
              <Text style={styles.emptyText}>No trips yet</Text>
            )}
            {allTrips.map((trip, i) => {
              const isActive = trip.id === activeTrip?.id;
              const color = TRIP_COLORS[i % TRIP_COLORS.length];
              return (
                <TouchableOpacity
                  key={trip.id}
                  style={[styles.tripRow, isActive && styles.tripRowActive]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setActiveTripId(trip.id);
                    setOpen(false);
                  }}
                >
                  <View style={[styles.tripColorBar, { backgroundColor: color }]} />
                  <View style={styles.tripInfo}>
                    <Text style={[styles.tripName, isActive && { color }]}>{trip.name}</Text>
                    {trip.dates_label ? (
                      <Text style={styles.tripDates}>{trip.dates_label}</Text>
                    ) : null}
                  </View>
                  {isActive && <Ionicons name="checkmark-circle" size={20} color={color} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.newTripBtn}
            activeOpacity={0.85}
            onPress={() => { setOpen(false); router.push('/create-trip'); }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#6B3FA0" />
            <Text style={styles.newTripText}>Plan a new trip</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9F8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    maxWidth: 220,
  },
  triggerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B3FA0',
    flexShrink: 1,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 4,
    maxHeight: '70%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    paddingVertical: 16,
    textAlign: 'center',
  },

  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 14,
  },
  tripRowActive: {
    backgroundColor: '#F5F3FF',
  },
  tripColorBar: {
    width: 4,
    height: 36,
    borderRadius: 2,
    flexShrink: 0,
  },
  tripInfo: { flex: 1, gap: 2 },
  tripName: { fontSize: 15, fontWeight: '600', color: '#374151' },
  tripNameActive: { color: '#6B3FA0', fontWeight: '700' },
  tripDates: { fontSize: 12, color: '#9CA3AF' },

  newTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#DDD6F3',
  },
  newTripText: { fontSize: 15, fontWeight: '600', color: '#6B3FA0' },
});
