import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const IS_WEB = Platform.OS === 'web';
let MapView: any = null, Marker: any = null, Polyline: any = null, PROVIDER_DEFAULT: any = null;
if (!IS_WEB) {
  const Maps = require('react-native-maps');
  MapView = Maps.default; Marker = Maps.Marker; Polyline = Maps.Polyline; PROVIDER_DEFAULT = Maps.PROVIDER_DEFAULT;
}

// ── Data ───────────────────────────────────────────────────────────────────────

const STOPS = [
  {
    id: 'rhine-falls',
    name: 'Rhine Falls',
    time: '11:00',
    category: 'Sightseeing',
    duration: '1 hr',
    status: 'done' as const,
    coordinate: { latitude: 47.6779, longitude: 8.6144 },
  },
  {
    id: 'therme-zurzach',
    name: 'Therme Zurzach',
    time: '14:00',
    category: 'Hot Spring',
    duration: '1.5 hr',
    status: 'current' as const,
    coordinate: { latitude: 47.5898, longitude: 8.2897 },
  },
  {
    id: 'lucerne',
    name: 'Lucerne',
    time: '17:00',
    category: 'Sightseeing',
    duration: '3 hr',
    status: 'upcoming' as const,
    coordinate: { latitude: 47.0502, longitude: 8.3093 },
  },
];

const MEMBERS = [
  { id: 'jee', initials: 'JE', color: '#6B3FA0', coordinate: { latitude: 47.678, longitude: 8.615 }, location: 'Rhine Falls area', live: true },
  { id: 'eliska', initials: 'EL', color: '#F97316', coordinate: { latitude: 47.055, longitude: 8.318 }, location: 'Luzern Hbf', live: true },
  { id: 'ben', initials: 'BE', color: '#22C55E', coordinate: { latitude: 47.638, longitude: 8.450 }, location: 'En route', live: false },
  { id: 'david', initials: 'DA', color: '#F59E0B', coordinate: { latitude: 47.591, longitude: 8.292 }, location: 'Zurzach', live: false },
];

const ROUTE_COORDS = STOPS.map((s) => s.coordinate);

const INITIAL_REGION = {
  latitude: 47.37,
  longitude: 8.47,
  latitudeDelta: 0.85,
  longitudeDelta: 0.55,
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [sharing, setSharing] = useState(true);
  const [selectedStop, setSelectedStop] = useState<string | null>('therme-zurzach');
  const [panelOpen, setPanelOpen] = useState(false);

  const focusStop = (stop: typeof STOPS[0]) => {
    setSelectedStop(stop.id);
    mapRef.current?.animateToRegion(
      {
        latitude: stop.coordinate.latitude + 0.04,
        longitude: stop.coordinate.longitude,
        latitudeDelta: 0.18,
        longitudeDelta: 0.12,
      },
      400,
    );
  };

  const resetView = () => {
    setSelectedStop(null);
    mapRef.current?.animateToRegion(INITIAL_REGION, 400);
  };

  const currentStop = STOPS.find((s) => s.status === 'current');

  if (IS_WEB) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Ionicons name="map-outline" size={48} color="#C4B5FD" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151' }}>Map view</Text>
          <Text style={{ fontSize: 13, color: '#9CA3AF' }}>Available in the mobile app</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        initialRegion={INITIAL_REGION}
        showsUserLocation={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
      >
        {/* Route polyline */}
        <Polyline
          coordinates={ROUTE_COORDS}
          strokeColor="#6B3FA0"
          strokeWidth={3}
          lineDashPattern={[8, 5]}
        />

        {/* Stop markers */}
        {STOPS.map((stop, index) => (
          <Marker
            key={stop.id}
            coordinate={stop.coordinate}
            onPress={() => focusStop(stop)}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.markerWrapper}>
              <View style={[
                styles.markerBubble,
                stop.status === 'done' && styles.markerDone,
                stop.status === 'current' && styles.markerCurrent,
                stop.status === 'upcoming' && styles.markerUpcoming,
                selectedStop === stop.id && styles.markerSelected,
              ]}>
                {stop.status === 'done' ? (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                ) : (
                  <Text style={[
                    styles.markerNumber,
                    stop.status === 'upcoming' && styles.markerNumberUpcoming,
                  ]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              {selectedStop === stop.id && (
                <View style={styles.markerCallout}>
                  <Text style={styles.calloutTime}>{stop.time}</Text>
                  <Text style={styles.calloutName}>{stop.name}</Text>
                  <Text style={styles.calloutMeta}>{stop.category} · {stop.duration}</Text>
                </View>
              )}
              <View style={[
                styles.markerPin,
                stop.status === 'done' && styles.markerPinDone,
                stop.status === 'current' && styles.markerPinCurrent,
                stop.status === 'upcoming' && styles.markerPinUpcoming,
              ]} />
            </View>
          </Marker>
        ))}

        {/* Member markers */}
        {MEMBERS.map((member) => (
          <Marker
            key={member.id}
            coordinate={member.coordinate}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.memberMarkerWrapper}>
              <View style={[styles.memberDot, { backgroundColor: member.color }, !member.live && styles.memberDotOff]}>
                <Text style={styles.memberDotText}>{member.initials}</Text>
              </View>
              {member.live && <View style={[styles.memberPin, { backgroundColor: member.color }]} />}
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Top overlays */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        {/* Header card */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={20} color="#111827" />
          </TouchableOpacity>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>2 live</Text>
          </View>
          <Text style={styles.headerTitle}>Strasbourg → Switzerland</Text>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/profile')} activeOpacity={0.8}>
            <Text style={styles.avatarBtnText}>JE</Text>
          </TouchableOpacity>
        </View>

        {/* Location sharing toggle */}
        <TouchableOpacity
          style={[styles.sharingPill, sharing && styles.sharingPillOn]}
          onPress={() => setSharing((v) => !v)}
          activeOpacity={0.85}
        >
          <Ionicons name={sharing ? 'location' : 'location-outline'} size={14} color="#FFFFFF" />
          <Text style={styles.sharingText}>{sharing ? 'Sharing location' : 'Location off'}</Text>
          <View style={[styles.sharingDot, sharing && styles.sharingDotOn]} />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Reset view button — appears when zoomed into a stop */}
      {selectedStop && (
        <TouchableOpacity style={styles.resetBtn} onPress={resetView} activeOpacity={0.8}>
          <Ionicons name="contract-outline" size={18} color="#374151" />
        </TouchableOpacity>
      )}

      {/* Bottom panel */}
      <View style={styles.bottomPanel}>
        {/* Next Up strip */}
        {currentStop && (
          <TouchableOpacity
            style={styles.nextUpStrip}
            onPress={() => { focusStop(currentStop); setPanelOpen((v) => !v); }}
            activeOpacity={0.9}
          >
            <View style={styles.nextUpIcon}>
              <Ionicons name="navigate" size={20} color="#6B3FA0" />
            </View>
            <View style={styles.nextUpContent}>
              <Text style={styles.nextUpLabel}>NOW · {currentStop.time}</Text>
              <Text style={styles.nextUpPlace}>{currentStop.name}</Text>
              <Text style={styles.nextUpMeta}>{currentStop.category} · {currentStop.duration}</Text>
            </View>
            <View style={styles.nextUpRight}>
              <Ionicons name={panelOpen ? 'chevron-down' : 'chevron-up'} size={18} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
        )}

        {/* Expanded stops list */}
        {panelOpen && (
          <View style={styles.stopsList}>
            {STOPS.map((stop, index) => (
              <TouchableOpacity
                key={stop.id}
                style={[styles.stopRow, selectedStop === stop.id && styles.stopRowSelected]}
                onPress={() => focusStop(stop)}
                activeOpacity={0.8}
              >
                {/* Timeline dot */}
                <View style={styles.stopTimelineCol}>
                  <View style={[
                    styles.stopDot,
                    stop.status === 'done' && styles.stopDotDone,
                    stop.status === 'current' && styles.stopDotCurrent,
                  ]}>
                    {stop.status === 'done'
                      ? <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                      : stop.status === 'current'
                        ? <View style={styles.stopDotInner} />
                        : <View style={styles.stopDotInnerGray} />
                    }
                  </View>
                  {index < STOPS.length - 1 && (
                    <View style={[styles.stopConnector, stop.status === 'done' && styles.stopConnectorDone]} />
                  )}
                </View>

                {/* Stop info */}
                <View style={styles.stopInfo}>
                  <Text style={styles.stopTime}>{stop.time}</Text>
                  <Text style={[styles.stopName, stop.status === 'done' && styles.stopNameDone]}>
                    {stop.name}
                  </Text>
                  <Text style={styles.stopMeta}>{stop.category} · {stop.duration}</Text>
                </View>

                {/* Status badge */}
                {stop.status === 'current' && (
                  <View style={styles.nowBadge}>
                    <Text style={styles.nowBadgeText}>NOW</Text>
                  </View>
                )}
                {stop.status === 'done' && (
                  <View style={styles.doneBadge}>
                    <Text style={styles.doneBadgeText}>Done</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Top overlay
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexShrink: 0,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Location sharing pill
  sharingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    backgroundColor: '#9CA3AF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  sharingPillOn: {
    backgroundColor: '#6B3FA0',
  },
  sharingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sharingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  sharingDotOn: {
    backgroundColor: '#A7F3D0',
  },

  // Reset zoom button
  resetBtn: {
    position: 'absolute',
    top: 160,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },

  // Stop markers
  markerWrapper: {
    alignItems: 'center',
  },
  markerBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    backgroundColor: '#6B3FA0',
  },
  markerDone: { backgroundColor: '#9CA3AF' },
  markerCurrent: { backgroundColor: '#6B3FA0', width: 40, height: 40, borderRadius: 20 },
  markerUpcoming: { backgroundColor: '#FFFFFF', borderColor: '#6B3FA0' },
  markerSelected: { width: 44, height: 44, borderRadius: 22 },
  markerNumber: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  markerNumberUpcoming: { color: '#6B3FA0' },
  markerPin: {
    width: 2,
    height: 8,
    backgroundColor: '#6B3FA0',
  },
  markerPinDone: { backgroundColor: '#9CA3AF' },
  markerPinCurrent: { backgroundColor: '#6B3FA0' },
  markerPinUpcoming: { backgroundColor: '#6B3FA0', opacity: 0.5 },

  // Callout bubble above marker
  markerCallout: {
    position: 'absolute',
    bottom: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
    minWidth: 140,
    alignItems: 'center',
  },
  calloutTime: { fontSize: 11, fontWeight: '700', color: '#6B3FA0' },
  calloutName: { fontSize: 14, fontWeight: '800', color: '#111827' },
  calloutMeta: { fontSize: 11, color: '#9CA3AF' },

  // Member markers
  memberMarkerWrapper: { alignItems: 'center' },
  memberDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  memberDotOff: { opacity: 0.5 },
  memberDotText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  memberPin: { width: 2, height: 6 },

  // Bottom panel
  bottomPanel: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    gap: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },

  // Next Up strip
  nextUpStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.98)',
    padding: 16,
  },
  nextUpIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nextUpContent: { flex: 1, gap: 1 },
  nextUpLabel: { fontSize: 10, fontWeight: '700', color: '#6B3FA0', letterSpacing: 0.8 },
  nextUpPlace: { fontSize: 16, fontWeight: '800', color: '#111827' },
  nextUpMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  nextUpRight: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Expanded stops list
  stopsList: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  stopRowSelected: {
    backgroundColor: '#FDFCFF',
  },
  stopTimelineCol: {
    alignItems: 'center',
    width: 20,
    flexShrink: 0,
    paddingTop: 2,
  },
  stopDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopDotDone: { backgroundColor: '#6B3FA0' },
  stopDotCurrent: { backgroundColor: '#EDE9F8', borderWidth: 2, borderColor: '#6B3FA0' },
  stopDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6B3FA0' },
  stopDotInnerGray: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  stopConnector: { width: 2, height: 24, backgroundColor: '#E5E7EB', marginTop: 2 },
  stopConnectorDone: { backgroundColor: '#C4B5D4' },
  stopInfo: { flex: 1, gap: 1 },
  stopTime: { fontSize: 11, fontWeight: '700', color: '#6B3FA0' },
  stopName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  stopNameDone: { color: '#9CA3AF' },
  stopMeta: { fontSize: 12, color: '#9CA3AF' },
  nowBadge: {
    backgroundColor: '#6B3FA0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'center',
  },
  nowBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  doneBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'center',
  },
  doneBadgeText: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
});
