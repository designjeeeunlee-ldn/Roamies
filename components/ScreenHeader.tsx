import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPE, SPACE } from '../lib/theme';

type Props = {
  /** Main title — trip name or screen name */
  title: string;
  /** Small pill badge right of title e.g. "D-5" or "Day 2/7" */
  badge?: string | null;
  /** When true the badge uses solid brand colour (mid-trip), otherwise light tint (upcoming) */
  badgeActive?: boolean;
  /** Left action — if provided shows a back chevron */
  onBack?: () => void;
  /** Right avatar initials — navigates to profile */
  avatarLabel?: string;
  onAvatarPress?: () => void;
  /** Optional right icon button — shown to the left of the avatar when both are present */
  rightIcon?: React.ComponentProps<typeof Ionicons>['name'];
  onRightPress?: () => void;
};

export default function ScreenHeader({
  title,
  badge,
  badgeActive = false,
  onBack,
  avatarLabel = 'ME',
  onAvatarPress,
  rightIcon,
  onRightPress,
}: Props) {
  return (
    <View style={styles.header}>
      {/* Left */}
      {onBack ? (
        <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconBtn} />
      )}

      {/* Centre */}
      <View style={styles.centre}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {badge ? (
          <View style={[styles.badge, badgeActive ? styles.badgeActive : styles.badgeUpcoming]}>
            <Text style={[styles.badgeText, badgeActive ? styles.badgeTextActive : styles.badgeTextUpcoming]}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Right — supports icon + avatar together */}
      <View style={styles.rightGroup}>
        {rightIcon && (
          <TouchableOpacity style={styles.iconBtn} onPress={onRightPress} activeOpacity={0.7}>
            <Ionicons name={rightIcon} size={20} color={COLORS.brand} />
          </TouchableOpacity>
        )}
        {onAvatarPress ? (
          <TouchableOpacity style={styles.avatar} onPress={onAvatarPress} activeOpacity={0.8}>
            <Text style={styles.avatarText}>{avatarLabel}</Text>
          </TouchableOpacity>
        ) : !rightIcon ? (
          <View style={styles.iconBtn} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
    gap: SPACE.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  centre: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: TYPE.md,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexShrink: 0,
  },
  badgeUpcoming: { backgroundColor: COLORS.brandLight },
  badgeActive:   { backgroundColor: COLORS.brand },
  badgeText: { fontSize: TYPE.xs, fontWeight: '700' },
  badgeTextUpcoming: { color: COLORS.brand },
  badgeTextActive:   { color: COLORS.surface },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    flexShrink: 0,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: TYPE.xs,
    fontWeight: '700',
    color: COLORS.surface,
  },
});
