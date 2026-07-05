import { withAlpha } from './helpers';
import { tokens } from './tokens';

const color = tokens.color;
const radius = tokens.radius;
const shadow = tokens.shadow;
const space = tokens.space;

export const components = {
  appScreen: {
    gradient: [color.surface.app.gradientStart, color.surface.app.default, color.surface.app.gradientEnd] as const,
  },
  // Borderless cards: white on warm cream with a soft neutral lift.
  // Separation comes from color and shadow, never hairlines.
  card: {
    default: {
      backgroundColor: color.surface.card.default,
      borderColor: 'transparent',
      borderRadius: radius.xl,
      borderWidth: 0,
      ...shadow.card,
    },
    warm: {
      backgroundColor: color.surface.card.warm,
      borderColor: 'transparent',
      borderRadius: radius.xl,
      borderWidth: 0,
      ...shadow.card,
    },
    frosted: {
      backgroundColor: color.surface.frosted,
      borderColor: 'transparent',
      borderRadius: radius.xl,
      borderWidth: 0,
      ...shadow.card,
    },
    success: {
      backgroundColor: color.surface.card.success,
      borderColor: 'transparent',
      borderRadius: radius.xl,
      borderWidth: 0,
      ...shadow.card,
    },
    info: {
      backgroundColor: color.surface.card.info,
      borderColor: 'transparent',
      borderRadius: radius.xl,
      borderWidth: 0,
      ...shadow.card,
    },
    hero: {
      backgroundColor: color.surface.hero.background,
      borderColor: 'transparent',
      borderRadius: radius.xl,
      borderWidth: 0,
      ...shadow.lift,
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
  // The scan CTA is a flat mint pill (no gradient, no decorative overlays) —
  // only the text/arrow colors live here.
  scanCta: {
    title: color.action.primary.foreground,
    arrowBackground: withAlpha(color.utility.white, 0.94),
    arrowForeground: color.accent.brandStrong,
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
    // Focused tabs sit on a soft mint tint (action.quiet); only the scan
    // button gets the solid brand fill.
    inactiveTint: color.text.tertiary,
  },
  avatar: {
    background: withAlpha(color.accent.mascot, 0.28),
    foreground: color.accent.brandStrong,
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
