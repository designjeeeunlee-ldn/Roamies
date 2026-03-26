import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Dimensions,
  StatusBar,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker, Callout } from 'react-native-maps';
import { useApp } from '../../context/AppContext';
import type { AppPhoto, Member } from '../../context/AppContext';
import { savePhotoToDevice } from '../../lib/useSavePhoto';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 8;
const GRID_ITEM = (SCREEN_WIDTH - 32 - GRID_GAP) / 2;

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberDisplay = { name: string; initials: string; color: string };

type Photo = {
  id: string;
  bg: string;
  publicUrl: string;
  takenBy: MemberDisplay;
  takenAt: string;
  coords?: { latitude: number; longitude: number };
};

type DayGroup = {
  id: string;
  label: string;
  photos: Photo[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

const PHOTO_BG_COLORS = ['#7B9EB5', '#C4956A', '#D4895A', '#2D3A4A', '#8B7355', '#2B7A6E', '#1A5F7A', '#3D7A52'];
function photoBg(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return PHOTO_BG_COLORS[Math.abs(h) % PHOTO_BG_COLORS.length];
}

function appPhotoToPhoto(p: AppPhoto, members: Member[]): Photo {
  const member = members.find((m) => m.id === p.uploadedBy);
  return {
    id: p.id,
    bg: photoBg(p.id),
    publicUrl: p.publicUrl,
    takenBy: member
      ? { name: member.name, initials: member.initials, color: member.color }
      : { name: 'Traveler', initials: '??', color: '#9CA3AF' },
    takenAt: new Date(p.createdAt).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit',
    }),
  };
}

function computeStats(groups: DayGroup[]) {
  const all = groups.flatMap((g) => g.photos);
  const contributors = new Set(all.map((p) => p.takenBy.initials)).size;
  return { total: all.length, contributors };
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PhotosScreen() {
  const router = useRouter();
  const { tripPhotos, members, activeTrip, profile, uploadPhoto } = useApp();

  const [tab, setTab] = useState<'gallery' | 'map'>('gallery');
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [uploading, setUploading] = useState(false);

  const dayGroups = useMemo<DayGroup[]>(() => {
    const grouped = new Map<string, AppPhoto[]>();
    tripPhotos.forEach((p) => {
      if (!grouped.has(p.tripDate)) grouped.set(p.tripDate, []);
      grouped.get(p.tripDate)!.push(p);
    });
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, photos]) => ({
        id: date,
        label: formatDateLabel(date),
        photos: photos.map((p) => appPhotoToPhoto(p, members)),
      }));
  }, [tripPhotos, members]);

  const stats = computeStats(dayGroups);

  const userInitials = profile?.display_name
    ? profile.display_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  const doUpload = async (uri: string) => {
    setUploading(true);
    try {
      await uploadPhoto(uri, todayIso());
    } catch {
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleTakePhoto = async () => {
    setShowUploadSheet(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled && result.assets.length > 0) await doUpload(result.assets[0].uri);
  };

  const handleChooseFromLibrary = async () => {
    setShowUploadSheet(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled && result.assets.length > 0) await doUpload(result.assets[0].uri);
  };

  const allPhotosWithCoords = dayGroups.flatMap((g) => g.photos).filter((p) => p.coords);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconPlaceholder} />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {activeTrip?.name ?? 'Trip Photos'}
        </Text>
        <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/profile')} activeOpacity={0.8}>
          <Text style={styles.avatarBtnText}>{userInitials}</Text>
        </TouchableOpacity>
      </View>

      {/* Gallery / Map toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, tab === 'gallery' && styles.toggleBtnActive]}
          onPress={() => setTab('gallery')}
        >
          <Text style={[styles.toggleText, tab === 'gallery' && styles.toggleTextActive]}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, tab === 'map' && styles.toggleBtnActive]}
          onPress={() => setTab('map')}
        >
          <Text style={[styles.toggleText, tab === 'map' && styles.toggleTextActive]}>Map</Text>
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <Ionicons name="images-outline" size={14} color="#9CA3AF" />
        <Text style={styles.statText}>{stats.total} photos</Text>
        <Text style={styles.statDot}>·</Text>
        <Ionicons name="people-outline" size={14} color="#9CA3AF" />
        <Text style={styles.statText}>{stats.contributors} contributors</Text>
      </View>

      {tab === 'gallery' ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {dayGroups.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No photos yet</Text>
              <Text style={styles.emptyText}>Tap + to add your first memory from this trip.</Text>
            </View>
          ) : (
            dayGroups.map((group) => (
              <DaySection
                key={group.id}
                group={group}
                onPhotoPress={setSelectedPhoto}
                onLongPress={(url) => savePhotoToDevice(url)}
              />
            ))
          )}
          <View style={{ height: 96 }} />
        </ScrollView>
      ) : (
        <MapView
          style={styles.map}
          initialRegion={{ latitude: 48.1, longitude: 8.0, latitudeDelta: 2.2, longitudeDelta: 1.5 }}
        >
          {allPhotosWithCoords.map((photo) => (
            <Marker key={photo.id} coordinate={photo.coords!} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.mapMarker, { backgroundColor: photo.takenBy.color }]} />
              <Callout tooltip>
                <View style={styles.callout}>
                  <Text style={styles.calloutText}>{photo.takenBy.name}</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => setShowUploadSheet(true)}
        disabled={uploading}
      >
        <Ionicons name={uploading ? 'cloud-upload-outline' : 'add'} size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Upload action sheet */}
      <Modal
        visible={showUploadSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUploadSheet(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowUploadSheet(false)}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Photo</Text>
            <TouchableOpacity style={styles.sheetOption} onPress={handleTakePhoto} activeOpacity={0.8}>
              <View style={styles.sheetOptionIcon}>
                <Ionicons name="camera-outline" size={22} color="#6B3FA0" />
              </View>
              <Text style={styles.sheetOptionText}>Take Photo</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </TouchableOpacity>
            <View style={styles.sheetDivider} />
            <TouchableOpacity style={styles.sheetOption} onPress={handleChooseFromLibrary} activeOpacity={0.8}>
              <View style={styles.sheetOptionIcon}>
                <Ionicons name="images-outline" size={22} color="#6B3FA0" />
              </View>
              <Text style={styles.sheetOptionText}>Choose from Library</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowUploadSheet(false)} activeOpacity={0.8}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Photo detail modal */}
      {selectedPhoto && (
        <PhotoDetail photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}
    </SafeAreaView>
  );
}

// ── Day section ───────────────────────────────────────────────────────────────

function DaySection({
  group,
  onPhotoPress,
  onLongPress,
}: {
  group: DayGroup;
  onPhotoPress: (p: Photo) => void;
  onLongPress: (url: string) => void;
}) {
  const [hero, ...rest] = group.photos;
  const rows: Photo[][] = [];
  for (let i = 0; i < rest.length; i += 2) rows.push(rest.slice(i, i + 2));

  return (
    <View style={styles.daySection}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayLabel}>{group.label}</Text>
        <Text style={styles.dayCount}>{group.photos.length} items</Text>
      </View>

      {hero && (
        <TouchableOpacity
          style={styles.heroPhoto}
          activeOpacity={0.92}
          onPress={() => onPhotoPress(hero)}
          onLongPress={() => onLongPress(hero.publicUrl)}
          delayLongPress={400}
        >
          <Image source={{ uri: hero.publicUrl }} style={styles.heroImage} />
          <MemberAvatar member={hero.takenBy} style={styles.avatarHero} />
        </TouchableOpacity>
      )}

      {rows.map((row, i) => (
        <View key={i} style={styles.gridRow}>
          {row.map((photo) => (
            <TouchableOpacity
              key={photo.id}
              style={styles.gridPhoto}
              activeOpacity={0.92}
              onPress={() => onPhotoPress(photo)}
              onLongPress={() => onLongPress(photo.publicUrl)}
              delayLongPress={400}
            >
              <Image source={{ uri: photo.publicUrl }} style={styles.gridImage} />
              <MemberAvatar member={photo.takenBy} style={styles.avatarGrid} />
            </TouchableOpacity>
          ))}
          {row.length === 1 && <View style={{ width: GRID_ITEM }} />}
        </View>
      ))}
    </View>
  );
}

// ── Photo detail modal ────────────────────────────────────────────────────────

function PhotoDetail({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={styles.detailContainer}>
        <Image source={{ uri: photo.publicUrl }} style={styles.detailPhoto} resizeMode="contain" />

        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Bottom info panel */}
        <View style={[styles.detailPanel, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.detailMeta}>
            <View style={styles.detailMetaRow}>
              <Ionicons name="calendar-outline" size={15} color="#6B7280" />
              <Text style={styles.detailMetaText}>{photo.takenAt}</Text>
            </View>
            <View style={styles.detailMetaRow}>
              <View style={[styles.detailAvatar, { backgroundColor: photo.takenBy.color }]}>
                <Text style={styles.detailAvatarText}>{photo.takenBy.initials}</Text>
              </View>
              <Text style={styles.detailMetaText}>Taken by {photo.takenBy.name}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveBtn}
            activeOpacity={0.8}
            onPress={() => savePhotoToDevice(photo.publicUrl)}
          >
            <Ionicons name="download-outline" size={18} color="#6B3FA0" />
            <Text style={styles.saveBtnText}>Save to Camera Roll</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function MemberAvatar({ member, style }: { member: MemberDisplay; style: object }) {
  return (
    <View style={[styles.avatarBase, style, { backgroundColor: member.color }]}>
      <Text style={styles.avatarText}>{member.initials}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerIconPlaceholder: { width: 36, height: 36 },
  avatarBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#6B3FA0', alignItems: 'center', justifyContent: 'center' },
  avatarBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#111827' },

  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    padding: 3,
    alignSelf: 'flex-start',
  },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 20 },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: { fontSize: 14, fontWeight: '500', color: '#6B7280' },
  toggleTextActive: { fontWeight: '700', color: '#6B3FA0' },

  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  statText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  statDot: { fontSize: 13, color: '#D1D5DB', marginHorizontal: 2 },

  scroll: { paddingHorizontal: 16 },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  daySection: { marginBottom: 24, gap: GRID_GAP },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  dayLabel: { fontSize: 18, fontWeight: '800', color: '#111827' },
  dayCount: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },

  heroPhoto: { borderRadius: 18, overflow: 'hidden', height: 240, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },

  gridRow: { flexDirection: 'row', gap: GRID_GAP },
  gridPhoto: { width: GRID_ITEM, height: GRID_ITEM, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  gridImage: { width: '100%', height: '100%' },

  avatarBase: { position: 'absolute', borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  avatarHero: { width: 34, height: 34, top: 10, left: 10 },
  avatarGrid: { width: 28, height: 28, top: 8, left: 8 },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },

  // Map
  map: { flex: 1 },
  mapMarker: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#FFFFFF' },
  callout: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  calloutText: { fontSize: 13, fontWeight: '600', color: '#111827' },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6B3FA0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },

  // Upload sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 36,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 20 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetOptionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EDE9F8', alignItems: 'center', justifyContent: 'center' },
  sheetOptionText: { flex: 1, fontSize: 16, fontWeight: '500', color: '#111827' },
  sheetDivider: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 54 },
  sheetCancel: { marginTop: 12, paddingVertical: 14, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center' },
  sheetCancelText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },

  // Detail modal
  detailContainer: { flex: 1, backgroundColor: '#111' },
  detailPhoto: { flex: 1 },
  closeBtn: {
    position: 'absolute', left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  detailPanel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingHorizontal: 20, gap: 12,
  },
  detailMeta: { gap: 10 },
  detailMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailMetaText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  detailAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  detailAvatarText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#EDE9F8',
    borderWidth: 1.5,
    borderColor: '#6B3FA0',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#6B3FA0' },
});
