import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Slide = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  bg: string;
  accent: string;
  pills: string[];
};

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'people',
    title: 'Travel is better\ntogether',
    subtitle: 'Plan, explore and make memories with your travel crew.',
    bg: '#F5F0FF',
    accent: '#6B3FA0',
    pills: ['Live location', 'Group chat', 'Shared plan'],
  },
  {
    id: '2',
    icon: 'paper-plane',
    title: 'Invite your\nCrew',
    subtitle: 'Set your destination and invite your travel mates in seconds.',
    bg: '#F0FDF4',
    accent: '#16A34A',
    pills: ['One link invite', 'QR code', 'Instant join'],
  },
  {
    id: '3',
    icon: 'flash',
    title: 'Co-create\nwith AI',
    subtitle: 'Co-create itineraries with AI that knows your group, dates and pets.',
    bg: '#EDE9F8',
    accent: '#6B3FA0',
    pills: ['AI suggestions', 'Real-time edits', 'Pet-friendly'],
  },
  {
    id: '4',
    icon: 'calendar',
    title: 'Flexible\nSchedules',
    subtitle: 'Roamies manages your daily plan. Redesign whenever you want.',
    bg: '#FFF7ED',
    accent: '#EA580C',
    pills: ['Daily stops', 'Skip & undo', 'Live updates'],
  },
  {
    id: '5',
    icon: 'camera',
    title: 'Real-time\nJournal',
    subtitle: 'Your shared travel journal. Share moments, archive them forever.',
    bg: '#F0F9FF',
    accent: '#0284C7',
    pills: ['Auto-organize', 'Private mode', 'Trip archive'],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const currentSlide = SLIDES[activeIndex];
  const isLast = activeIndex === SLIDES.length - 1;

  const handleNext = () => {
    if (isLast) {
      router.replace('/sign-in');
    } else {
      const next = activeIndex + 1;
      scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
      setActiveIndex(next);
    }
  };

  const handleSkip = () => {
    router.replace('/sign-in');
  };

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: currentSlide.bg }]}
      edges={['top', 'bottom']}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoIconCircle}>
            <Ionicons name="navigate" size={16} color="#FFFFFF" />
          </View>
          <Text style={styles.logoText}>Roamies</Text>
        </View>
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {SLIDES.map((slide) => (
          <View key={slide.id} style={[styles.slide, { backgroundColor: slide.bg }]}>
            {/* Illustration area */}
            <View style={styles.illustrationArea}>
              {/* Large background card */}
              <View
                style={[
                  styles.illustrationCard,
                  { backgroundColor: slide.accent + '26' },
                ]}
              >
                {/* Icon circle */}
                <View
                  style={[
                    styles.iconOuterRing,
                    { borderColor: slide.accent + '33' },
                  ]}
                >
                  <View
                    style={[
                      styles.iconInnerRing,
                      { borderColor: slide.accent + '55' },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconCircle,
                        {
                          backgroundColor: slide.accent,
                          shadowColor: slide.accent,
                        },
                      ]}
                    >
                      <Ionicons name={slide.icon as any} size={52} color="#FFFFFF" />
                    </View>
                  </View>
                </View>

                {/* Feature pills */}
                <View style={styles.pillsRow}>
                  {slide.pills.map((pill) => (
                    <View
                      key={pill}
                      style={[
                        styles.pill,
                        { backgroundColor: slide.accent + '26' },
                      ]}
                    >
                      <Text style={[styles.pillText, { color: slide.accent }]}>
                        {pill}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Text */}
            <View style={styles.textBlock}>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.subtitle}>{slide.subtitle}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom area */}
      <View style={styles.bottom}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex && [
                  styles.dotActive,
                  { backgroundColor: currentSlide.accent },
                ],
              ]}
            />
          ))}
        </View>

        {/* Next / Get Started button */}
        <TouchableOpacity
          style={[
            styles.btn,
            {
              backgroundColor: currentSlide.accent,
              shadowColor: currentSlide.accent,
            },
          ]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>{isLast ? 'Get Started' : 'Next'}</Text>
          {!isLast && <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />}
        </TouchableOpacity>

        {/* Sign-in link on last slide */}
        {isLast && (
          <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}>
            <Text style={styles.signInLink}>
              Already have an account?{' '}
              <Text style={[styles.signInLinkBold, { color: currentSlide.accent }]}>
                Sign in
              </Text>
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 4,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#6B3FA0',
    letterSpacing: -0.5,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  },

  // Scroll view
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    // no additional styles needed; each slide fills SCREEN_WIDTH
  },

  // Slide
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 36,
  },

  // Illustration
  illustrationArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationCard: {
    width: 280,
    height: 280,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingBottom: 16,
  },
  iconOuterRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInnerRing: {
    width: 164,
    height: 164,
    borderRadius: 82,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 124,
    height: 124,
    borderRadius: 62,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // Text
  textBlock: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
  },

  // Bottom
  bottom: {
    paddingHorizontal: 28,
    paddingBottom: 24,
    gap: 16,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  dotActive: {
    width: 24,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 32,
    paddingVertical: 18,
    alignSelf: 'stretch',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  btnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signInLink: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  signInLinkBold: {
    fontWeight: '700',
  },
});
