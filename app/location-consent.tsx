import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

function StepHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={stepStyles.stepHeader}>
      <TouchableOpacity onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="arrow-back" size={22} color="#374151" />
      </TouchableOpacity>
      <View style={stepStyles.stepIndicator}>
        <View style={stepStyles.stepDotDone}>
          <Ionicons name="checkmark" size={8} color="#FFFFFF" />
        </View>
        <View style={stepStyles.stepLineDone} />
        <View style={stepStyles.stepDotDone}>
          <Ionicons name="checkmark" size={8} color="#FFFFFF" />
        </View>
        <View style={stepStyles.stepLineDone} />
        <View style={[stepStyles.stepDot, stepStyles.stepDotActive]} />
      </View>
      <View style={{ width: 22 }} />
    </View>
  );
}

const stepStyles = StyleSheet.create({
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
  stepLineDone: {
    width: 20,
    height: 2,
    backgroundColor: '#6B3FA0',
  },
});

type ConsentOption = 'trip_dates' | 'app_open' | 'off';

const OPTIONS: {
  id: ConsentOption;
  title: string;
  description: string;
  icon: string;
  recommended?: boolean;
}[] = [
  {
    id: 'trip_dates',
    title: 'During trip dates only',
    description: 'Automatically active Apr 2 – Apr 7. Turns off when the trip ends — no action needed.',
    icon: 'calendar-outline',
    recommended: true,
  },
  {
    id: 'app_open',
    title: 'Only while app is open',
    description: 'Shared only when Roamies is in the foreground. Stops when you close the app.',
    icon: 'phone-portrait-outline',
  },
  {
    id: 'off',
    title: 'Off',
    description: "You won't appear on the group map. You can still see everyone else and use all features.",
    icon: 'location-outline',
  },
];

export default function LocationConsentScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<ConsentOption>('trip_dates');

  const handleConfirm = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StepHeader onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Ionicons name="location" size={36} color="#6B3FA0" />
          </View>
        </View>

        {/* Heading */}
        <View style={styles.headingBlock}>
          <Text style={styles.heading}>Location Sharing</Text>
          <Text style={styles.tripName}>Strasbourg → Switzerland</Text>
          <Text style={styles.subheading}>
            Let your travel companions see where you are on the group map. This setting applies to this trip only.
          </Text>
        </View>

        {/* Options */}
        <View style={styles.options}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                onPress={() => setSelected(opt.id)}
                activeOpacity={0.8}
              >
                {/* Left icon */}
                <View style={[styles.optionIcon, isSelected && styles.optionIconSelected]}>
                  <Ionicons
                    name={opt.icon as any}
                    size={20}
                    color={isSelected ? '#6B3FA0' : '#9CA3AF'}
                  />
                </View>

                {/* Content */}
                <View style={styles.optionContent}>
                  <View style={styles.optionTitleRow}>
                    <Text style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>
                      {opt.title}
                    </Text>
                    {opt.recommended && (
                      <View style={styles.recommendedBadge}>
                        <Text style={styles.recommendedText}>Recommended</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.optionDescription}>{opt.description}</Text>
                </View>

                {/* Radio */}
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Privacy note */}
        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#6B7280" />
          <Text style={styles.privacyText}>
            This is set per trip and never carries over. You can change it anytime in trip settings. Declining doesn't affect any other features.
          </Text>
        </View>

        {/* Spacer for button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* CTA */}
      <View style={styles.ctaBar}>
        <TouchableOpacity style={styles.ctaBtn} onPress={handleConfirm} activeOpacity={0.85}>
          <Text style={styles.ctaBtnText}>
            {selected === 'off' ? 'Continue without sharing' : 'Confirm & Continue'}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F4F8',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },

  // Icon
  iconWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Heading
  headingBlock: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 36,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.3,
  },
  tripName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B3FA0',
  },
  subheading: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 4,
  },

  // Options
  options: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  optionCardSelected: {
    borderColor: '#6B3FA0',
    backgroundColor: '#FDFCFF',
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  optionIconSelected: {
    backgroundColor: '#EDE9F8',
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  optionTitleSelected: {
    color: '#111827',
  },
  recommendedBadge: {
    backgroundColor: '#EDE9F8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  recommendedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B3FA0',
  },
  optionDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 4,
  },
  radioSelected: {
    borderColor: '#6B3FA0',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6B3FA0',
  },

  // Privacy note
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
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
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#6B3FA0',
    borderRadius: 32,
    paddingVertical: 18,
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
});
