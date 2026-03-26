import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type Source = {
  name: string;
  score: number;
  review_count: number;
  sponsored: boolean;
};

export type AiSummary = {
  history: string;
  famous_for: string;
  local_tip: string;
};

export type Stop = {
  id: string;
  time: string;
  place_name: string;
  category: string;
  description: string;
  hours_today: 'open' | 'closed' | 'unknown';
  duration_minutes: number;
  pet_friendly?: boolean;
  origin: 'ai_suggested' | 'user_added';
  sources: Source[];
  image_url?: string;
  highly_recommended?: boolean;
  cost?: '$' | '$$' | '$$$' | 'free';
  ai_summary?: AiSummary;
};

type Props = {
  stop: Stop;
  onConfirm: () => void;
  onSkip: () => void;
  showActions?: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  food: 'FOOD',
  sight: 'SIGHTSEEING',
  travel: 'TRAVEL',
  hotel: 'HOTEL',
  free: 'FREE TIME',
  spa: 'HOT SPRING',
  wine: 'WINE',
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h} hr` : `${h.toFixed(1)} hr`;
}

function formatReviewCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function StarRow({ score }: { score: number }) {
  const full = Math.floor(score);
  const half = score - full >= 0.5;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < full;
        const isHalf = !filled && i === full && half;
        return (
          <Ionicons
            key={i}
            name={filled ? 'star' : isHalf ? 'star-half' : 'star-outline'}
            size={16}
            color="#F59E0B"
          />
        );
      })}
    </View>
  );
}

export default function FlashCard({ stop, onConfirm, onSkip, showActions = true }: Props) {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const topSource = stop.sources[0];
  const categoryLabel = CATEGORY_LABELS[stop.category] ?? stop.category.toUpperCase();

  return (
    <>
      <View style={styles.card}>
        {/* Image area */}
        <View style={styles.imageContainer}>
          {stop.image_url ? (
            <Image source={{ uri: stop.image_url }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]} />
          )}

          {/* Trust pill — tap to open source drawer */}
          {topSource && (
            <TouchableOpacity style={styles.trustPill} activeOpacity={0.8} onPress={() => setDrawerVisible(true)}>
              <Text style={styles.trustText}>
                {topSource.score} ★ · verified ›
              </Text>
            </TouchableOpacity>
          )}

          {/* Highly recommended badge */}
          {stop.highly_recommended && (
            <View style={styles.recommendedBadge}>
              <Ionicons name="flash" size={12} color="#FFFFFF" />
              <Text style={styles.recommendedText}>HIGHLY RECOMMENDED</Text>
            </View>
          )}

        </View>

        {/* Card body */}
        <View style={styles.body}>
          <Text style={styles.meta}>
            {stop.time} · {categoryLabel}
          </Text>
          <Text style={styles.placeName}>{stop.place_name}</Text>
          <Text style={styles.description}>{stop.description}</Text>

          <View style={styles.tagsRow}>
            {stop.hours_today !== 'unknown' && (
              <View style={styles.tag}>
                <View style={[styles.dot, { backgroundColor: stop.hours_today === 'open' ? '#22C55E' : '#EF4444' }]} />
                <Text style={styles.tagText}>
                  {stop.hours_today === 'open' ? 'Open' : 'Closed'}
                </Text>
              </View>
            )}
            <View style={styles.tag}>
              <Ionicons name="time-outline" size={13} color="#6B7280" />
              <Text style={styles.tagText}>{formatDuration(stop.duration_minutes)}</Text>
            </View>
            {stop.cost && stop.cost !== 'free' && (
              <View style={styles.tag}>
                <Ionicons name="cash-outline" size={13} color="#6B7280" />
                <Text style={styles.tagText}>{stop.cost}</Text>
              </View>
            )}
          </View>

          {stop.pet_friendly && (
            <View style={styles.tagsRow}>
              <View style={styles.tag}>
                <Text style={styles.tagText}>Dog-friendly</Text>
              </View>
            </View>
          )}
        </View>

        {/* Actions */}
        {showActions && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.skipButton} onPress={onSkip} activeOpacity={0.8}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={onConfirm} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
              <Text style={styles.confirmText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Source drawer */}
      <Modal
        visible={drawerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDrawerVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setDrawerVisible(false)}>
          <Pressable style={styles.drawer} onPress={() => {}}>
            {/* Handle */}
            <View style={styles.drawerHandle} />

            <Text style={styles.drawerTitle}>Source Info</Text>
            <Text style={styles.drawerSubtitle}>
              Roamies uses verified third-party data to surface the best stops for your trip.
            </Text>

            {stop.sources.map((src, i) => (
              <View key={i} style={styles.sourceCard}>
                <View style={styles.sourceRow}>
                  <View style={styles.sourceIconCircle}>
                    <Ionicons name="map" size={18} color="#6B3FA0" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.sourceNameRow}>
                      <Text style={styles.sourceName}>{src.name}</Text>
                      {src.sponsored && (
                        <View style={styles.sponsoredBadge}>
                          <Text style={styles.sponsoredText}>SPONSORED</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.scoreRow}>
                      <StarRow score={src.score} />
                      <Text style={styles.scoreText}>{src.score}</Text>
                      <Text style={styles.reviewCount}>
                        ({formatReviewCount(src.review_count)} reviews)
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.sourceDivider} />

                <View style={styles.sourceMetaRow}>
                  <Ionicons name="shield-checkmark-outline" size={14} color="#22C55E" />
                  <Text style={styles.sourceMetaText}>Independently verified · Not a paid placement</Text>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.drawerClose} onPress={() => setDrawerVisible(false)} activeOpacity={0.85}>
              <Text style={styles.drawerCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
    marginHorizontal: 20,
  },

  // Image
  imageContainer: { height: 240, position: 'relative' },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { backgroundColor: '#B0CDE0' },

  // Trust pill
  trustPill: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  trustText: { fontSize: 12, fontWeight: '600', color: '#1F2937' },

  // Highly recommended
  recommendedBadge: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    backgroundColor: '#7A5C10',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  recommendedText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },

  // AI badge
  aiBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: '#6B3FA0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  aiText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1 },

  // Body
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 6 },
  meta: { fontSize: 12, fontWeight: '700', color: '#6B3FA0', letterSpacing: 0.8, textTransform: 'uppercase' },
  placeName: { fontSize: 28, fontWeight: '800', color: '#111827', lineHeight: 34 },
  description: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginTop: 2 },

  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tagText: { fontSize: 13, color: '#374151', fontWeight: '500' },

  // Actions
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  skipButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  skipText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 32,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Source drawer
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  drawer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 16,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 8,
  },
  drawerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  drawerSubtitle: { fontSize: 13, color: '#6B7280', lineHeight: 18, marginTop: -8 },

  sourceCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sourceRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  sourceIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sourceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sourceName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sponsoredBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sponsoredText: { fontSize: 9, fontWeight: '700', color: '#92400E', letterSpacing: 0.5 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  reviewCount: { fontSize: 13, color: '#9CA3AF' },

  sourceDivider: { height: 1, backgroundColor: '#E5E7EB' },

  sourceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceMetaText: { fontSize: 12, color: '#6B7280' },

  drawerClose: {
    backgroundColor: '#6B3FA0',
    borderRadius: 32,
    paddingVertical: 16,
    alignItems: 'center',
  },
  drawerCloseText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
