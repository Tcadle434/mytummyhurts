import { TextStyle } from 'react-native';

import { foundations } from './foundations';
import { withAlpha } from './helpers';

const brand = foundations.color.brand;
const ink = brand.ink;
const neutral = foundations.color.neutral;

export const tokens = {
  color: {
    surface: {
      app: {
        default: brand.canvas,
        raised: neutral.warm[0],
        gradientStart: neutral.warm[50],
        gradientEnd: neutral.warm[100],
        ornamentMint: withAlpha(brand.pip.base, 0.28),
        ornamentPeach: withAlpha(brand.pip.accent, 0.24),
      },
      card: {
        default: brand.surface.default,
        warm: brand.surface.warm,
        success: '#F1F9F3',
        info: '#F2F8FC',
      },
      sheet: brand.surface.default,
      frosted: withAlpha(foundations.color.neutral.white, 0.78),
    },
    text: {
      primary: ink,
      secondary: neutral.cool[700],
      tertiary: neutral.cool[600],
      inverse: foundations.color.neutral.white,
      accent: '#2F6953',
      warm: '#845B23',
      danger: '#9C3427',
    },
    border: {
      subtle: withAlpha(ink, 0.08),
      strong: withAlpha(ink, 0.14),
      emphasis: withAlpha(brand.cta.scan, 0.24),
    },
    overlay: {
      scrim: withAlpha('#161D21', 0.44),
    },
    accent: {
      brand: brand.cta.scan,
      brandStrong: '#478A70',
      mascot: brand.pip.base,
      mascotAccent: brand.pip.accent,
      warm: brand.status.yellow,
    },
    action: {
      primary: {
        background: brand.cta.scan,
        foreground: foundations.color.neutral.white,
      },
      secondary: {
        background: foundations.color.neutral.white,
        foreground: ink,
      },
      quiet: {
        background: withAlpha(brand.pip.base, 0.16),
        foreground: '#2F6953',
      },
    },
    info: {
      background: '#EAF5FB',
      foreground: '#407BA0',
      tint: brand.info.blue,
    },
    chart: {
      info: brand.info.blue,
      grid: withAlpha(ink, 0.08),
      track: neutral.warm[200],
    },
    status: {
      risk: {
        low: {
          foreground: '#3A7F63',
          background: '#E5F3EA',
          tint: '#67AD87',
        },
        medium: {
          foreground: '#9A5E14',
          background: brand.status.mediumBackground,
          tint: brand.status.orange,
        },
        high: {
          foreground: '#A13B29',
          background: '#FFE2DA',
          tint: brand.status.red,
        },
      },
      // The five caseboard verdict tones. Text on `background` always uses
      // `foreground` (text-grade contrast); `tint` is for fills, meters, and
      // dots only. Cleared is deliberately a deeper green than safe — the
      // earned verdict outranks the hopeful one.
      verdict: {
        confirmed: {
          foreground: '#A13B29',
          background: '#FFE2DA',
          tint: brand.status.red,
        },
        suspect: {
          foreground: '#9A5E14',
          background: brand.status.mediumBackground,
          tint: brand.status.orange,
        },
        watching: {
          foreground: neutral.cool[800],
          background: neutral.warm[100],
          tint: neutral.cool[600],
        },
        safe: {
          foreground: '#3A7F63',
          background: '#E5F3EA',
          tint: '#67AD87',
        },
        cleared: {
          foreground: '#1E5C42',
          background: '#D3EBDC',
          tint: '#2F8461',
        },
      },
      success: {
        foreground: '#2F6E54',
        background: '#E8F4EC',
      },
      warning: {
        foreground: '#8A6418',
        background: '#FFF0CB',
      },
      danger: {
        foreground: '#A13B29',
        background: '#FFE2DA',
      },
    },
    icon: {
      primary: ink,
      muted: neutral.cool[600],
      inverse: foundations.color.neutral.white,
      accent: '#2F6953',
      info: '#407BA0',
      danger: brand.status.red,
    },
    utility: {
      shadow: foundations.color.neutral.black,
      handle: withAlpha(ink, 0.12),
      white: foundations.color.neutral.white,
    },
  },
  type: {
    display: {
      hero: {
        fontFamily: foundations.typography.family.display,
        fontSize: 38,
        lineHeight: 44,
        letterSpacing: -1,
      } satisfies TextStyle,
      section: {
        fontFamily: foundations.typography.family.display,
        fontSize: 30,
        lineHeight: 34,
        letterSpacing: -0.6,
      } satisfies TextStyle,
      accent: {
        fontFamily: foundations.typography.family.display,
        fontSize: 22,
        lineHeight: 26,
        letterSpacing: -0.4,
      } satisfies TextStyle,
      // Hero numerals — Gut Score, Daily Score, scan scores. The serif is the
      // app's voice for anything it has concluded; numbers it stands behind
      // get the display face, not another Jakarta weight.
      metric: {
        fontFamily: foundations.typography.family.display,
        fontSize: 46,
        lineHeight: 50,
        letterSpacing: -1,
      } satisfies TextStyle,
    },
    title: {
      screen: {
        fontFamily: foundations.typography.family.bodyBold,
        fontSize: 24,
        lineHeight: 30,
        letterSpacing: -0.4,
      } satisfies TextStyle,
      card: {
        fontFamily: foundations.typography.family.bodyBold,
        fontSize: 20,
        lineHeight: 26,
        letterSpacing: -0.3,
      } satisfies TextStyle,
      block: {
        fontFamily: foundations.typography.family.bodyBold,
        fontSize: 18,
        lineHeight: 24,
        letterSpacing: -0.2,
      } satisfies TextStyle,
    },
    body: {
      default: {
        fontFamily: foundations.typography.family.bodyRegular,
        fontSize: 15,
        lineHeight: 22,
      } satisfies TextStyle,
      emphasis: {
        fontFamily: foundations.typography.family.bodyMedium,
        fontSize: 15,
        lineHeight: 22,
      } satisfies TextStyle,
      small: {
        fontFamily: foundations.typography.family.bodyRegular,
        fontSize: 13,
        lineHeight: 19,
      } satisfies TextStyle,
      strong: {
        fontFamily: foundations.typography.family.bodySemibold,
        fontSize: 15,
        lineHeight: 22,
      } satisfies TextStyle,
    },
    label: {
      button: {
        fontFamily: foundations.typography.family.bodyBold,
        fontSize: 16,
        lineHeight: 20,
      } satisfies TextStyle,
      chip: {
        fontFamily: foundations.typography.family.bodySemibold,
        fontSize: 14,
        lineHeight: 18,
      } satisfies TextStyle,
      tab: {
        fontFamily: foundations.typography.family.bodyMedium,
        fontSize: 12,
        lineHeight: 16,
      } satisfies TextStyle,
      eyebrow: {
        fontFamily: foundations.typography.family.bodyMedium,
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0.4,
      } satisfies TextStyle,
      metric: {
        fontFamily: foundations.typography.family.bodyMedium,
        fontSize: 12,
        lineHeight: 16,
      } satisfies TextStyle,
    },
    metric: {
      value: {
        fontFamily: foundations.typography.family.bodyBold,
        fontSize: 18,
        lineHeight: 22,
      } satisfies TextStyle,
      label: {
        fontFamily: foundations.typography.family.bodyMedium,
        fontSize: 12,
        lineHeight: 16,
      } satisfies TextStyle,
    },
  },
  space: foundations.space,
  radius: foundations.radius,
  shadow: {
    card: {
      shadowColor: foundations.color.neutral.black,
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    lift: {
      shadowColor: foundations.color.neutral.black,
      shadowOpacity: 0.08,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 6,
    },
    modal: {
      shadowColor: foundations.color.neutral.black,
      shadowOpacity: 0.12,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: 16 },
      elevation: 8,
    },
  },
  motion: foundations.motion,
} as const;
