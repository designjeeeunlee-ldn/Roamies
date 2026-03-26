import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FlashCard, { Stop } from './FlashCard';

type Props = {
  stop: Stop;
  onDone: () => void;
  onSkip: () => void;
};

const CARD_MIN_HEIGHT = 420;

const AI_SECTIONS = [
  { key: 'history' as const, icon: 'book-outline', label: 'History' },
  { key: 'famous_for' as const, icon: 'star-outline', label: 'Famous For' },
  { key: 'local_tip' as const, icon: 'bulb-outline', label: 'Local Tip' },
] as const;

export default function FlipCard({ stop, onDone, onSkip }: Props) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [faceHeight, setFaceHeight] = useState(CARD_MIN_HEIGHT);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handleFlip = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setIsFlipped((v) => !v);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  const summary = stop.ai_summary;

  return (
    <View style={styles.wrapper}>
      {/* Card face — fades between front and back, consistent height */}
      <Animated.View style={{ opacity: fadeAnim, minHeight: faceHeight }}>
        {!isFlipped ? (
          /* ── Front ── */
          <TouchableOpacity
            onPress={handleFlip}
            activeOpacity={0.97}
          >
            <View
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > faceHeight) setFaceHeight(h);
              }}
            >
              <FlashCard stop={stop} onConfirm={onDone} onSkip={onSkip} showActions={false} />
            </View>
          </TouchableOpacity>
        ) : (
          /* ── Back ── */
          <View style={[styles.backCard, { height: faceHeight }]}>
            <View style={styles.backHeader}>
              <View style={styles.aiBadge}>
                <Ionicons name="flash" size={12} color="#FFFFFF" />
                <Text style={styles.aiText}>AI GUIDE</Text>
              </View>
              <TouchableOpacity onPress={handleFlip} activeOpacity={0.7} style={styles.flipBtn}>
                <Ionicons name="repeat" size={18} color="#6B3FA0" />
              </TouchableOpacity>
            </View>

            <Text style={styles.backPlaceName}>{stop.place_name}</Text>
            <Text style={styles.backSubtitle}>Here's what you should know before you go.</Text>

            <ScrollView
              style={styles.summaryScroll}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {summary ? (
                AI_SECTIONS.map((section) => (
                  <View key={section.key} style={styles.summarySection}>
                    <View style={styles.summaryLabelRow}>
                      <View style={styles.summaryIconCircle}>
                        <Ionicons name={section.icon as any} size={16} color="#6B3FA0" />
                      </View>
                      <Text style={styles.summaryLabel}>{section.label}</Text>
                    </View>
                    <Text style={styles.summaryBody}>{summary[section.key]}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.noSummary}>
                  <Ionicons name="flash-outline" size={32} color="#D1D5DB" />
                  <Text style={styles.noSummaryText}>
                    AI summary will be available once you're connected.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Animated.View>

      {/* Buttons — always below, never part of the card */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.skipButton} onPress={onSkip} activeOpacity={0.8}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.doneButton} onPress={onDone} activeOpacity={0.8}>
          <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.flipHint} onPress={handleFlip} activeOpacity={0.8}>
          <Ionicons name="information-circle-outline" size={20} color="#6B3FA0" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outer wrapper — background matches screen so the gap between card and buttons
  // occludes the ghost backCard below
  wrapper: {
    gap: 12,
    backgroundColor: '#EEEEF6',
  },

  // Back card — same horizontal margin as FlashCard (20px each side)
  backCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
    padding: 20,
  },

  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#6B3FA0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  aiText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.8 },
  flipBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backPlaceName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  backSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  summaryScroll: {
    flex: 1,
  },
  summarySection: { marginBottom: 16, gap: 8 },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryBody: { fontSize: 14, color: '#4B5563', lineHeight: 21, paddingLeft: 38 },
  noSummary: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  noSummaryText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },

  // Actions — always below card via gap: 12 on wrapper
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
  },
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
  doneButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 32,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  doneText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  flipHint: {
    width: 52,
    height: 52,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});
