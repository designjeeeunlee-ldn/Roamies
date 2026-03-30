import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { parseDatesLabel, TRIP_COLORS } from '../components/TripCalendar';

type TravelStatus = 'explorer' | 'planning' | 'on_trip' | 'home';

const STATUS_OPTIONS: { id: TravelStatus; label: string; icon: string; color: string }[] = [
  { id: 'on_trip', label: 'On a Trip', icon: 'airplane', color: '#6B3FA0' },
  { id: 'planning', label: 'Planning', icon: 'map', color: '#3B82F6' },
  { id: 'explorer', label: 'Explorer', icon: 'compass', color: '#F59E0B' },
  { id: 'home', label: 'At Home', icon: 'home', color: '#10B981' },
];


export default function ProfileScreen() {
  const router = useRouter();
  const { profile, updateProfile, allTrips, setActiveTripId, deleteTrip } = useApp();

  // Classify trips as upcoming/ongoing vs past
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const upcomingTrips = allTrips.filter((t) => {
    if (!t.dates_label) return true; // no dates = treat as upcoming
    const r = parseDatesLabel(t.dates_label);
    if (!r) return true;
    const end = new Date(r.end); end.setHours(23, 59, 59, 999);
    return end >= todayMidnight; // ongoing or future
  });
  const pastTrips = allTrips.filter((t) => {
    if (!t.dates_label) return false;
    const r = parseDatesLabel(t.dates_label);
    if (!r) return false;
    const end = new Date(r.end); end.setHours(23, 59, 59, 999);
    return end < todayMidnight;
  });

  const handleDeleteTrip = (tripId: string, tripName: string) => {
    Alert.alert(
      'Delete trip',
      `Remove "${tripName}" and all its stops? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteTrip(tripId);
            } catch (e: any) {
              Alert.alert('Could not delete', e?.message ?? 'Something went wrong. Try again.');
            }
          }
        },
      ]
    );
  };

  const [status, setStatus] = useState<TravelStatus>('on_trip');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  // Edit Profile modal
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editLocation, setEditLocation] = useState('');

  // Derive display values from profile (fall back to placeholders)
  const displayName = profile?.display_name ?? 'Your Name';
  const displayHandle = profile?.handle ?? '@handle';
  const displayLocation = profile?.location ?? 'Location';

  // Sync status from profile
  useEffect(() => {
    if (profile?.travel_status) setStatus(profile.travel_status as TravelStatus);
  }, [profile?.travel_status]);

  // Privacy & Data modal
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [shareActivity, setShareActivity] = useState(true);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [dataDownloadSent, setDataDownloadSent] = useState(false);

  const handleAvatarPress = async () => {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };
  const [petFriendly, setPetFriendly] = useState(true);
  const [locationPrivacy, setLocationPrivacy] = useState(true);
  const [notifications, setNotifications] = useState(true);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Me</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Avatar + identity */}
        <View style={styles.identitySection}>
          <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.85} style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>JE</Text>
            </View>
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.handle}>{displayHandle}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color="#9CA3AF" />
            <Text style={styles.locationText}>{displayLocation}</Text>
          </View>
        </View>

        {/* Stats bento */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardPurple]}>
            <Text style={styles.statNumber}>14</Text>
            <Text style={styles.statLabel}>Countries</Text>
            <Ionicons name="globe-outline" size={20} color="rgba(255,255,255,0.6)" style={styles.statIcon} />
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, styles.statNumberDark]}>38</Text>
            <Text style={[styles.statLabel, styles.statLabelDark]}>Cities</Text>
            <Ionicons name="business-outline" size={20} color="#D1D5DB" style={styles.statIcon} />
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, styles.statNumberDark]}>194</Text>
            <Text style={[styles.statLabel, styles.statLabelDark]}>Photos Shared</Text>
            <Ionicons name="images-outline" size={20} color="#D1D5DB" style={styles.statIcon} />
          </View>
          <View style={[styles.statCard, styles.statCardGold]}>
            <Text style={styles.statNumber}>3</Text>
            <Text style={styles.statLabel}>Trips This Year</Text>
            <Ionicons name="airplane-outline" size={20} color="rgba(255,255,255,0.6)" style={styles.statIcon} />
          </View>
        </View>

        {/* Travel status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Travel Status</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.statusPill, status === opt.id && styles.statusPillActive]}
                onPress={() => { setStatus(opt.id); updateProfile({ travel_status: opt.id }); }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={14}
                  color={status === opt.id ? opt.color : '#9CA3AF'}
                />
                <Text style={[styles.statusLabel, status === opt.id && styles.statusLabelActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Upcoming travels — always visible */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming Travel</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/create-trip')}>
              <Text style={styles.seeAllText}>+ New trip</Text>
            </TouchableOpacity>
          </View>

          {upcomingTrips.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyTripsCard}
              activeOpacity={0.8}
              onPress={() => router.push('/create-trip')}
            >
              <Ionicons name="airplane-outline" size={24} color="#6B3FA0" />
              <Text style={styles.emptyTripsText}>No upcoming trips yet</Text>
              <Text style={styles.emptyTripsSub}>Tap to plan your next adventure</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.tripsList}>
              {upcomingTrips.map((trip) => {
                const color = TRIP_COLORS[allTrips.indexOf(trip) % TRIP_COLORS.length];
                const r = trip.dates_label ? parseDatesLabel(trip.dates_label) : null;
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const start = r ? new Date(r.start) : null;
                if (start) start.setHours(0, 0, 0, 0);
                const diff = start ? Math.round((start.getTime() - today.getTime()) / 86400000) : null;
                const badge = diff === null ? null
                  : diff === 0 ? 'Today'
                  : diff > 0 ? `D-${diff}`
                  : 'Ongoing';
                return (
                  <TouchableOpacity
                    key={trip.id}
                    style={styles.tripCard}
                    activeOpacity={0.8}
                    onPress={() => {
                      setActiveTripId(trip.id);
                      router.push({ pathname: '/trip-detail', params: { id: trip.id } });
                    }}
                  >
                    <View style={[styles.tripBar, { backgroundColor: color }]} />
                    <View style={styles.tripInfo}>
                      <Text style={styles.tripName}>{trip.name}</Text>
                      {trip.dates_label && <Text style={styles.tripDates}>{trip.dates_label}</Text>}
                    </View>
                    {badge && (
                      <View style={[styles.upcomingBadge, { backgroundColor: color + '22' }]}>
                        <Text style={[styles.upcomingBadgeText, { color }]}>{badge}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); handleDeleteTrip(trip.id, trip.name); }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.tripDeleteBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={15} color="#EF4444" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Past travels */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Past Travels</Text>
          </View>

          {pastTrips.length === 0 ? (
            <View style={styles.emptyTripsCard}>
              <Ionicons name="map-outline" size={24} color="#6B3FA0" />
              <Text style={styles.emptyTripsText}>No past trips yet</Text>
              <Text style={styles.emptyTripsSub}>Completed trips will appear here</Text>
            </View>
          ) : (
            <View style={styles.tripsList}>
              {pastTrips.map((trip, idx) => {
                const color = TRIP_COLORS[idx % TRIP_COLORS.length];
                const datesLabel = trip.dates_label ?? '';
                return (
                  <TouchableOpacity
                    key={trip.id}
                    style={styles.pastTripCard}
                    activeOpacity={0.8}
                    onPress={() =>
                      router.push({
                        pathname: '/past-trip-route',
                        params: { id: trip.id, name: trip.name, dates: datesLabel },
                      })
                    }
                  >
                    <View style={[styles.tripBar, { backgroundColor: color }]} />
                    <View style={styles.tripInfo}>
                      <Text style={styles.tripName}>{trip.name}</Text>
                      {!!datesLabel && <Text style={styles.tripDates}>{datesLabel}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <View style={styles.settingsCard}>
            <SettingRow
              icon="paw"
              iconBg="#FEF3C7"
              iconColor="#F59E0B"
              label="Pet-Friendly Planning"
              sub="Filter stays & transit for pets"
              value={petFriendly}
              onToggle={setPetFriendly}
            />
            <View style={styles.settingDivider} />
            <SettingRow
              icon="location"
              iconBg="#EDE9F8"
              iconColor="#6B3FA0"
              label="Default Location Privacy"
              sub="Trip dates only by default"
              value={locationPrivacy}
              onToggle={setLocationPrivacy}
            />
            <View style={styles.settingDivider} />
            <SettingRow
              icon="notifications"
              iconBg="#ECFDF5"
              iconColor="#10B981"
              label="Push Notifications"
              sub="Group updates and AI suggestions"
              value={notifications}
              onToggle={setNotifications}
            />
          </View>
        </View>

        {/* Account actions */}
        <View style={styles.section}>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.actionRow} activeOpacity={0.7} onPress={() => { setEditName(displayName); setEditHandle(displayHandle); setEditLocation(displayLocation); setShowEditProfile(true); }}>
              <View style={[styles.actionIconCircle, { backgroundColor: '#F3F4F6' }]}>
                <Ionicons name="person-outline" size={18} color="#6B7280" />
              </View>
              <Text style={styles.actionLabel}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
            <View style={styles.settingDivider} />
            <TouchableOpacity style={styles.actionRow} activeOpacity={0.7} onPress={() => setShowPrivacy(true)}>
              <View style={[styles.actionIconCircle, { backgroundColor: '#F3F4F6' }]}>
                <Ionicons name="shield-outline" size={18} color="#6B7280" />
              </View>
              <Text style={styles.actionLabel}>Privacy & Data</Text>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
            <View style={styles.settingDivider} />
            <TouchableOpacity
              style={styles.actionRow}
              activeOpacity={0.7}
              onPress={() => {
                Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
                ]);
              }}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.actionLabel, { color: '#EF4444' }]}>Sign Out</Text>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.versionText}>Roamies v1.0.0</Text>
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={showEditProfile} animationType="slide" transparent presentationStyle="overFullScreen">
        <KeyboardAvoidingView style={profileModalStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={profileModalStyles.backdrop} activeOpacity={1} onPress={() => setShowEditProfile(false)} />
          <View style={profileModalStyles.sheet}>
            <View style={profileModalStyles.handle} />
            <Text style={profileModalStyles.title}>Edit Profile</Text>

            {[
              { label: 'Display name', value: editName, onChange: setEditName, icon: 'person-outline', placeholder: 'Your name' },
              { label: 'Handle',       value: editHandle,   onChange: setEditHandle,   icon: 'at-outline',     placeholder: '@handle' },
              { label: 'Location',     value: editLocation, onChange: setEditLocation, icon: 'location-outline', placeholder: 'City, Country' },
            ].map((field) => (
              <View key={field.label} style={profileModalStyles.fieldBlock}>
                <Text style={profileModalStyles.fieldLabel}>{field.label}</Text>
                <View style={profileModalStyles.inputRow}>
                  <Ionicons name={field.icon as any} size={16} color="#9CA3AF" />
                  <TextInput
                    style={profileModalStyles.input}
                    value={field.value}
                    onChangeText={field.onChange}
                    placeholder={field.placeholder}
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                  />
                </View>
              </View>
            ))}

            <TouchableOpacity
              style={profileModalStyles.saveBtn}
              activeOpacity={0.85}
              onPress={() => {
                const name = editName.trim() || displayName;
                const handle = editHandle.trim() || displayHandle;
                const location = editLocation.trim() || displayLocation;
                updateProfile({ display_name: name, handle, location });
                setShowEditProfile(false);
              }}
            >
              <Text style={profileModalStyles.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Privacy & Data Modal ── */}
      <Modal visible={showPrivacy} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={profileModalStyles.overlay}>
          <TouchableOpacity style={profileModalStyles.backdrop} activeOpacity={1} onPress={() => setShowPrivacy(false)} />
          <View style={profileModalStyles.sheet}>
            <View style={profileModalStyles.handle} />
            <Text style={profileModalStyles.title}>Privacy & Data</Text>

            <View style={profileModalStyles.privacyCard}>
              <View style={profileModalStyles.privacyRow}>
                <View style={profileModalStyles.privacyInfo}>
                  <Text style={profileModalStyles.privacyLabel}>Share activity status</Text>
                  <Text style={profileModalStyles.privacySub}>Let trip members see when you were last active</Text>
                </View>
                <Switch value={shareActivity} onValueChange={setShareActivity} trackColor={{ false: '#D1D5DB', true: '#6B3FA0' }} thumbColor="#FFF" />
              </View>
              <View style={profileModalStyles.privacyDivider} />
              <View style={profileModalStyles.privacyRow}>
                <View style={profileModalStyles.privacyInfo}>
                  <Text style={profileModalStyles.privacyLabel}>Analytics</Text>
                  <Text style={profileModalStyles.privacySub}>Help improve Roamies with anonymous usage data</Text>
                </View>
                <Switch value={analyticsEnabled} onValueChange={setAnalyticsEnabled} trackColor={{ false: '#D1D5DB', true: '#6B3FA0' }} thumbColor="#FFF" />
              </View>
            </View>

            <TouchableOpacity
              style={[profileModalStyles.dataBtn, dataDownloadSent && profileModalStyles.dataBtnSent]}
              activeOpacity={0.85}
              onPress={() => { setDataDownloadSent(true); setTimeout(() => setDataDownloadSent(false), 3000); }}
            >
              <Ionicons name={dataDownloadSent ? 'checkmark' : 'download-outline'} size={16} color={dataDownloadSent ? '#FFFFFF' : '#6B3FA0'} />
              <Text style={[profileModalStyles.dataBtnText, dataDownloadSent && { color: '#FFFFFF' }]}>
                {dataDownloadSent ? 'Request sent — check your email' : 'Request data download'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={profileModalStyles.deleteBtn}
              activeOpacity={0.85}
              onPress={() => Alert.alert('Delete Account', 'This will permanently delete your account and all data. This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => supabase.auth.signOut() },
              ])}
            >
              <Text style={profileModalStyles.deleteBtnText}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SettingRow({
  icon,
  iconBg,
  iconColor,
  label,
  sub,
  value,
  onToggle,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  sub: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={[styles.settingIconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#D1D5DB', true: '#6B3FA0' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F8' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827', letterSpacing: -0.2 },
  headerEdit: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: 20 },

  // Identity
  identitySection: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  displayName: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  handle: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 13, color: '#9CA3AF' },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  statCardPurple: { backgroundColor: '#6B3FA0' },
  statCardGold: { backgroundColor: '#F59E0B' },
  statNumber: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  statNumberDark: { color: '#111827' },
  statLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  statLabelDark: { color: '#9CA3AF' },
  statIcon: { position: 'absolute', bottom: 12, right: 12 },

  // Section
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 12, letterSpacing: -0.1 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAllText: { fontSize: 13, fontWeight: '600', color: '#6B3FA0' },

  // Status
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  statusPillActive: { borderColor: '#6B3FA0', backgroundColor: '#FDFCFF' },
statusLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  statusLabelActive: { color: '#6B3FA0' },

  // Past trips
  tripsList: { gap: 10 },
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    paddingRight: 16,
    paddingVertical: 14,
    gap: 14,
  },
  pastTripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    paddingRight: 12,
    paddingVertical: 14,
    gap: 12,
  },
  routeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9F8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
  },
  routeBtnText: { fontSize: 12, fontWeight: '700', color: '#6B3FA0' },
  tripBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: '#6B3FA0' },
  upcomingBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  upcomingBadgeText: { fontSize: 12, fontWeight: '700' },
  emptyTripsCard: {
    backgroundColor: '#F5F3FF', borderRadius: 16,
    paddingVertical: 24, alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#EDE9F8', borderStyle: 'dashed',
  },
  emptyTripsText: { fontSize: 14, fontWeight: '700', color: '#6B3FA0' },
  emptyTripsSub: { fontSize: 12, color: '#9CA3AF' },
  tripDeleteBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  tripInfo: { flex: 1, gap: 3 },
  tripName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  tripDates: { fontSize: 12, color: '#9CA3AF' },
  tripMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
  tripMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tripMetaText: { fontSize: 12, color: '#9CA3AF' },

  // Settings card
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  settingIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  settingText: { flex: 1, gap: 2 },
  settingLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  settingSub: { fontSize: 12, color: '#9CA3AF' },
  settingDivider: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 68 },

  // Action rows
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },

  versionText: { textAlign: 'center', fontSize: 12, color: '#D1D5DB', marginTop: 24 },
});

const profileModalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, gap: 14 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },

  fieldBlock: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F9FAFB', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  input: { flex: 1, fontSize: 15, color: '#111827' },
  saveBtn: {
    backgroundColor: '#6B3FA0', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 4,
    shadowColor: '#6B3FA0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  privacyCard: { backgroundColor: '#F9FAFB', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  privacyDivider: { height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 16 },
  privacyInfo: { flex: 1, gap: 2 },
  privacyLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  privacySub: { fontSize: 12, color: '#9CA3AF' },

  dataBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: '#DDD6F3', backgroundColor: '#FDFCFF',
  },
  dataBtnSent: { backgroundColor: '#6B3FA0', borderColor: '#6B3FA0' },
  dataBtnText: { fontSize: 14, fontWeight: '600', color: '#6B3FA0' },
  deleteBtn: { alignItems: 'center', paddingVertical: 8 },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
});
