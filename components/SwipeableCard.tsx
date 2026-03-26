import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import FlashCard, { Stop } from './FlashCard';

const SWIPE_THRESHOLD = 80;

type Props = {
  stop: Stop;
  onDone: () => void;
  onSkip: () => void;
};

export default function SwipeableCard({ stop, onDone, onSkip }: Props) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const swipeDone = useCallback(
    (direction: 'done' | 'skip') => {
      if (direction === 'done') onDone();
      else onSkip();
    },
    [onDone, onSkip],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-8, 8])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.15;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const dir = e.translationX > 0 ? 'done' : 'skip';
        translateX.value = withTiming(
          e.translationX > 0 ? 700 : -700,
          { duration: 280 },
          () => runOnJS(swipeDone)(dir),
        );
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 180 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 180 });
      }
    });

  const animStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-300, 300],
      [-14, 14],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  // "DONE" hint fades in when swiping right
  const doneHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [20, 100], [0, 1], Extrapolation.CLAMP),
  }));

  // "SKIP" hint fades in when swiping left
  const skipHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-20, -100], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animStyle}>
        <FlashCard stop={stop} onConfirm={onDone} onSkip={onSkip} />

        {/* Done hint — top-left overlay */}
        <Animated.View style={[styles.hint, styles.hintDone, doneHintStyle]}>
          <Animated.Text style={styles.hintTextDone}>DONE ✓</Animated.Text>
        </Animated.View>

        {/* Skip hint — top-right overlay */}
        <Animated.View style={[styles.hint, styles.hintSkip, skipHintStyle]}>
          <Animated.Text style={styles.hintTextSkip}>SKIP</Animated.Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    top: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 3,
  },
  hintDone: {
    left: 36,
    borderColor: '#22C55E',
    backgroundColor: 'rgba(255,255,255,0.9)',
    transform: [{ rotate: '-12deg' }],
  },
  hintSkip: {
    right: 36,
    borderColor: '#EF4444',
    backgroundColor: 'rgba(255,255,255,0.9)',
    transform: [{ rotate: '12deg' }],
  },
  hintTextDone: {
    fontSize: 16,
    fontWeight: '800',
    color: '#22C55E',
    letterSpacing: 1,
  },
  hintTextSkip: {
    fontSize: 16,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 1,
  },
});
