export const palette = {
  background: '#F5EFE3',
  backgroundElevated: '#FFF9F1',
  card: '#FFFCF6',
  cardMuted: '#EEF3EA',
  primary: '#1F5C4B',
  primaryDark: '#174538',
  sage: '#A5B990',
  sageSoft: '#DDE7D5',
  text: '#20251F',
  textMuted: '#637063',
  border: '#D8D5CC',
  divider: '#E6E0D4',
  shadow: '#14211A',
  low: '#4B9E6A',
  medium: '#D1A23D',
  high: '#D46B4A',
  danger: '#B5533C',
  white: '#FFFFFF',
  overlay: 'rgba(16, 24, 20, 0.44)',
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor: palette.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  lift: {
    shadowColor: palette.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
};

export const type = {
  display: {
    fontFamily: 'InstrumentSerif_400Regular',
  },
  body: {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
  },
};
