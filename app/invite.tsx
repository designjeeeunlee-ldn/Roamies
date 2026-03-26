import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';

export default function InviteScreen() {
  const router = useRouter();
  const { activeTrip } = useApp();
  const [copied, setCopied] = useState(false);

  const tripName = activeTrip?.name ?? 'our trip';
  const tripSlug = tripName.toLowerCase().replace(/\s+/g, '-');
  const TRIP_LINK = `roamies.app/join/${tripSlug}`;

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async (_channel: 'messages' | 'email' | 'other') => {
    try {
      await Share.share({
        message: `Join "${tripName}" on Roamies! https://${TRIP_LINK}`,
        url: `https://${TRIP_LINK}`,
      });
    } catch {
      // user cancelled — no-op
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Step indicator header */}
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View style={styles.stepIndicator}>
          <View style={styles.stepDotDone}>
            <Ionicons name="checkmark" size={8} color="#FFFFFF" />
          </View>
          <View style={styles.stepLineDone} />
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={styles.stepLine} />
          <View style={styles.stepDot} />
        </View>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Badge */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>NEW JOURNEY</Text>
        </View>

        {/* Heading */}
        <Text style={styles.heading}>The more,{'\n'}the merrier.</Text>
        <Text style={styles.subheading}>
          Invite your travel companions to collaborate on {tripName}.
        </Text>

        {/* Link card */}
        <View style={styles.linkCard}>
          <Text style={styles.linkCardLabel}>TRIP ACCESS LINK</Text>
          <View style={styles.linkRow}>
            <View style={styles.linkBox}>
              <Ionicons name="link-outline" size={16} color="#6B7280" />
              <Text style={styles.linkText} numberOfLines={1}>{TRIP_LINK}</Text>
            </View>
            <TouchableOpacity
              style={[styles.copyBtn, copied && styles.copyBtnDone]}
              onPress={handleCopy}
              activeOpacity={0.8}
            >
              <Text style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy'}</Text>
            </TouchableOpacity>
          </View>

          {/* Share channel buttons */}
          <View style={styles.shareRow}>
            <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare('messages')} activeOpacity={0.8}>
              <View style={styles.shareBtnIcon}>
                <Ionicons name="chatbubble" size={22} color="#6B3FA0" />
              </View>
              <Text style={styles.shareBtnLabel}>MESSAGES</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare('email')} activeOpacity={0.8}>
              <View style={styles.shareBtnIcon}>
                <Ionicons name="mail" size={22} color="#6B3FA0" />
              </View>
              <Text style={styles.shareBtnLabel}>EMAIL</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare('other')} activeOpacity={0.8}>
              <View style={styles.shareBtnIcon}>
                <Ionicons name="share-social" size={22} color="#6B3FA0" />
              </View>
              <Text style={styles.shareBtnLabel}>OTHER</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* QR section */}
        <View style={styles.qrSection}>
          {/* QR placeholder */}
          <View style={styles.qrWrapper}>
            <QRPlaceholder />
          </View>

          <View style={styles.qrInfo}>
            <View style={styles.qrLabelRow}>
              <Ionicons name="qr-code-outline" size={22} color="#111827" />
              <Text style={styles.qrTitle}>Quick Scan</Text>
            </View>
            <Text style={styles.qrBody}>
              Let your friends scan this code directly from your phone to join the trip instantly. Perfect for airport meetups.
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed CTA */}
      <View style={styles.ctaBar}>
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => router.push('/location-consent')}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaBtnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/location-consent')}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── QR code placeholder ───────────────────────────────────────────────────────

function QRPlaceholder() {
  // Simulate QR pattern with a grid of dark/light squares
  const SIZE = 9;
  const grid = Array.from({ length: SIZE }, (_, row) =>
    Array.from({ length: SIZE }, (_, col) => {
      // Corners always dark (finder pattern)
      if ((row < 3 && col < 3) || (row < 3 && col >= SIZE - 3) || (row >= SIZE - 3 && col < 3)) return true;
      return Math.random() > 0.5;
    }),
  );

  return (
    <View style={styles.qrGrid}>
      {grid.map((row, r) => (
        <View key={r} style={styles.qrRow}>
          {row.map((dark, c) => (
            <View key={c} style={[styles.qrCell, dark ? styles.qrCellDark : styles.qrCellLight]} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F4F8',
  },

  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
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
  stepDotDone: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    width: 20,
    height: 2,
    backgroundColor: '#E5E7EB',
  },
  stepLineDone: {
    width: 20,
    height: 2,
    backgroundColor: '#6B3FA0',
  },

  scroll: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 20,
  },

  // Badge
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE9D0',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#78450A',
    letterSpacing: 0.8,
  },

  // Heading
  heading: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginTop: -4,
  },

  // Link card
  linkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  linkCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  copyBtn: {
    backgroundColor: '#6B3FA0',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  copyBtnDone: {
    backgroundColor: '#22C55E',
  },
  copyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Share buttons
  shareRow: {
    flexDirection: 'row',
    gap: 10,
  },
  shareBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingVertical: 14,
  },
  shareBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.5,
  },

  // QR section
  qrSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  qrWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  qrGrid: {
    gap: 3,
  },
  qrRow: {
    flexDirection: 'row',
    gap: 3,
  },
  qrCell: {
    width: 18,
    height: 18,
    borderRadius: 2,
  },
  qrCellDark: {
    backgroundColor: '#111827',
  },
  qrCellLight: {
    backgroundColor: '#F3F4F6',
  },

  qrInfo: {
    alignItems: 'center',
    gap: 8,
  },
  qrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qrTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  qrBody: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
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
    gap: 10,
    alignItems: 'center',
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#6B3FA0',
    borderRadius: 32,
    paddingVertical: 18,
    alignSelf: 'stretch',
    shadowColor: '#6B3FA0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  skipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
  },
});
