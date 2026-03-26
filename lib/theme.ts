// ── Roamies Design System ────────────────────────────────────────────────────
// Single source of truth for typography, color, and shadow tokens.

export const COLORS = {
  brand:       '#6B3FA0',
  brandLight:  '#EDE9F8',
  brandMid:    '#C4B5D4',
  bg:          '#F4F4F8',
  surface:     '#FFFFFF',
  textPrimary: '#111827',
  textSecondary:'#6B7280',
  textMuted:   '#9CA3AF',
  border:      '#E5E7EB',
  borderLight: '#F3F4F6',
  danger:      '#EF4444',
  dangerLight: '#FEF2F2',
  success:     '#10B981',
  warning:     '#F59E0B',
};

// 6-step type scale
export const TYPE = {
  xs:   11,  // labels, badges, captions
  sm:   13,  // secondary text, metadata, timestamps
  base: 15,  // body text, list items
  md:   17,  // subheadings, card titles, nav items
  lg:   22,  // section headings, trip names
  xl:   36,  // hero headlines, onboarding titles
};

// 2-level shadow system
export const SHADOW = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#6B3FA0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
};

// Radius scale
export const RADIUS = {
  sm:   10,
  md:   16,
  lg:   20,
  xl:   28,
  pill: 999,
};

// Spacing scale
export const SPACE = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
};
