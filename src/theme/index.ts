import { foundations } from './foundations';
import { tokens } from './tokens';
import { components } from './components';

export { foundations, tokens, components };
export * from './mascot';

export const spacing = {
  xs: tokens.space.xs,
  sm: tokens.space.sm,
  md: tokens.space.md,
  lg: tokens.space.lg,
  xl: tokens.space.xl,
  xxl: tokens.space.xxl,
  xxxl: tokens.space.xxxl,
};

export const radii = {
  sm: tokens.radius.sm,
  md: tokens.radius.md,
  lg: tokens.radius.lg,
  xl: tokens.radius.xl,
  xxl: tokens.radius.xxl,
  pill: tokens.radius.pill,
};

export const shadows = {
  card: tokens.shadow.card,
  lift: tokens.shadow.lift,
  modal: tokens.shadow.modal,
};

export const type = {
  display: {
    fontFamily: foundations.typography.family.display,
  },
  body: {
    regular: foundations.typography.family.bodyRegular,
    medium: foundations.typography.family.bodyMedium,
    semibold: foundations.typography.family.bodySemibold,
    bold: foundations.typography.family.bodyBold,
  },
  title: tokens.type.title,
  label: tokens.type.label,
};

export const palette = {
  background: tokens.color.surface.app.default,
  backgroundElevated: tokens.color.surface.app.raised,
  card: tokens.color.surface.card.default,
  cardMuted: tokens.color.surface.card.warm,
  primary: tokens.color.accent.brand,
  primaryDark: tokens.color.accent.brandStrong,
  sageSoft: tokens.color.status.success.background,
  sageLight: tokens.color.surface.card.success,
  text: tokens.color.text.primary,
  textMuted: tokens.color.text.secondary,
  border: tokens.color.border.subtle,
  divider: tokens.color.border.strong,
  pillGreen: tokens.color.status.success.background,
  pillGreenBorder: tokens.color.border.emphasis,
  pillGreenText: tokens.color.status.success.foreground,
  peachSoft: tokens.color.status.danger.background,
  peachStrong: foundations.color.brand.pip.accent,
  creamStrong: foundations.color.brand.status.yellow,
  line: tokens.color.chart.track,
  softBlue: tokens.color.info.background,
  shadow: tokens.color.utility.shadow,
  low: tokens.color.status.risk.low.tint,
  medium: tokens.color.status.risk.medium.tint,
  high: tokens.color.status.risk.high.tint,
  danger: tokens.color.status.danger.foreground,
  white: tokens.color.utility.white,
  overlay: tokens.color.overlay.scrim,
  surfaceContainerLow: tokens.color.surface.card.default,
  outlineVariant: tokens.color.border.subtle,
};
