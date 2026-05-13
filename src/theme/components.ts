import { withAlpha } from './helpers';
import { tokens } from './tokens';

const color = tokens.color;
const radius = tokens.radius;
const shadow = tokens.shadow;
const space = tokens.space;

export const components = {
  appScreen: {
    gradient: [color.surface.app.gradientStart, color.surface.app.default, color.surface.app.gradientEnd] as const,
    ornament: {
      topRight: color.surface.app.ornamentMint,
      bottomLeft: color.surface.app.ornamentPeach,
      midLeft: withAlpha(color.accent.warm, 0.12),
      dotMint: withAlpha(color.accent.mascot, 0.42),
      dotPeach: withAlpha(color.accent.mascotAccent, 0.5),
    },
  },
  card: {
    default: {
      backgroundColor: color.surface.card.default,
      borderColor: color.border.subtle,
      borderRadius: radius.xl,
      borderWidth: 1,
      ...shadow.card,
    },
    warm: {
      backgroundColor: color.surface.card.warm,
      borderColor: color.border.subtle,
      borderRadius: radius.xl,
      borderWidth: 1,
      ...shadow.card,
    },
    frosted: {
      backgroundColor: color.surface.frosted,
      borderColor: color.border.subtle,
      borderRadius: radius.xl,
      borderWidth: 1,
      ...shadow.card,
    },
    success: {
      backgroundColor: color.surface.card.success,
      borderColor: color.border.subtle,
      borderRadius: radius.xl,
      borderWidth: 1,
      ...shadow.card,
    },
    info: {
      backgroundColor: color.surface.card.info,
      borderColor: color.border.subtle,
      borderRadius: radius.xl,
      borderWidth: 1,
      ...shadow.card,
    },
  },
  button: {
    primary: {
      minHeight: 56,
      borderRadius: radius.pill,
      backgroundColor: color.action.primary.background,
      paddingHorizontal: space.lg,
      ...shadow.lift,
    },
    secondary: {
      minHeight: 54,
      borderRadius: radius.pill,
      backgroundColor: withAlpha(color.utility.white, 0.92),
      borderWidth: 1,
      borderColor: color.border.subtle,
      paddingHorizontal: space.lg,
    },
    quiet: {
      minHeight: 54,
      borderRadius: radius.pill,
      backgroundColor: color.action.quiet.background,
      borderWidth: 1,
      borderColor: color.border.emphasis,
      paddingHorizontal: space.lg,
    },
  },
  scanCta: {
    gradient: [color.accent.mascot, color.accent.brand, color.accent.brandStrong] as const,
    ornamentLeft: withAlpha(color.utility.white, 0.06),
    ornamentRight: withAlpha(color.utility.white, 0.08),
    title: color.text.inverse,
    subtitle: withAlpha(color.utility.white, 0.84),
    arrowBackground: withAlpha(color.utility.white, 0.92),
    arrowForeground: color.text.primary,
  },
  chip: {
    option: {
      backgroundColor: withAlpha(color.utility.white, 0.9),
      borderColor: color.border.subtle,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 11,
    },
    optionSelected: {
      backgroundColor: color.accent.brand,
      borderColor: color.accent.brand,
    },
    segmented: {
      backgroundColor: withAlpha(color.utility.white, 0.92),
      borderColor: color.border.subtle,
      borderRadius: radius.pill,
      borderWidth: 1,
      minHeight: 44,
    },
    segmentedSelected: {
      backgroundColor: color.accent.brand,
      borderColor: color.accent.brand,
    },
  },
  badge: {
    default: {
      backgroundColor: withAlpha(color.utility.white, 0.88),
      foreground: color.text.primary,
    },
    soft: {
      backgroundColor: color.status.success.background,
      foreground: color.status.success.foreground,
    },
    warm: {
      backgroundColor: color.status.warning.background,
      foreground: color.text.warm,
    },
    info: {
      backgroundColor: color.info.background,
      foreground: color.info.foreground,
    },
    risk: {
      low: color.status.risk.low,
      medium: color.status.risk.medium,
      high: color.status.risk.high,
    },
    danger: color.status.danger,
  },
  input: {
    backgroundColor: withAlpha(color.utility.white, 0.94),
    borderColor: color.border.subtle,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 54,
  },
  tabBar: {
    shell: {
      height: 74,
      borderRadius: radius.xl,
      backgroundColor: withAlpha(color.surface.app.raised, 0.96),
      borderWidth: 1,
      borderColor: color.border.subtle,
      paddingHorizontal: space.lg,
      ...shadow.lift,
    },
    activeTint: color.accent.brand,
    inactiveTint: color.text.tertiary,
  },
  avatar: {
    background: color.info.background,
    foreground: color.text.primary,
  },
  premiumBadge: {
    background: color.status.warning.background,
    foreground: color.text.warm,
  },
  profileMeter: {
    trackLow: color.status.success.background,
    trackMedium: color.status.warning.background,
    trackHigh: color.status.risk.high.tint,
    centerBackground: color.status.success.background,
  },
  bottomSheet: {
    shell: {
      backgroundColor: color.surface.sheet,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: space.lg,
      paddingTop: space.md,
      paddingBottom: space.xxl,
      ...shadow.modal,
    },
    handle: {
      width: 52,
      height: 5,
      borderRadius: radius.pill,
      backgroundColor: color.utility.handle,
    },
    backdrop: color.overlay.scrim,
  },
  chart: {
    track: color.chart.track,
    grid: color.chart.grid,
    info: color.chart.info,
    risk: {
      low: color.status.risk.low.tint,
      medium: color.status.risk.medium.tint,
      high: color.status.risk.high.tint,
    },
  },
} as const;
