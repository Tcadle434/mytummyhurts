import { TextStyle } from 'react-native';

import { foundations } from './foundations';
import { withAlpha } from './helpers';

const brand = foundations.color.brand;
const ink = brand.ink;
const neutral = foundations.color.neutral;

const evergreen = brand.evergreen;

export const tokens = {
  color: {
    surface: {
      app: {
        default: brand.canvas,
        raised: neutral.warm[0],
        gradientStart: neutral.warm[50],
        gradientEnd: neutral.warm[100],
      },
      card: {
        default: brand.surface.default,
        warm: brand.surface.warm,
        success: '#EAF4EC',
        info: '#EFF6FA',
      },
      // Daylight hero blocks: the one WARM surface per screen (peach-cream,
      // never dark). Text on it uses the `on*` colors, which are ink-based —
      // the hero is light now, so on-hero text is dark.
      hero: {
        background: brand.hero.base,
        deep: brand.hero.deep,
        raised: withAlpha('#FFFFFF', 0.75),
        onHero: ink,
        onHeroMuted: withAlpha(ink, 0.68),
        onHeroFaint: withAlpha(ink, 0.45),
      },
      sheet: brand.surface.default,
      frosted: withAlpha(foundations.color.neutral.white, 0.82),
      // The one sanctioned dark surface: camera glass. Video is dark, so the
      // viewfinder chrome stays deep evergreen with porcelain text.
      viewfinder: {
        glass: evergreen.deep,
        onGlass: evergreen.onDeep,
        onGlassMuted: evergreen.onDeepMuted,
      },
    },
    text: {
      primary: ink,
      secondary: neutral.cool[700],
      tertiary: neutral.cool[600],
      inverse: neutral.white,
      accent: evergreen.bright,
      warm: '#8F5A16',
      danger: '#A33B26',
    },
    border: {
      subtle: withAlpha(ink, 0.07),
      strong: withAlpha(ink, 0.13),
      emphasis: withAlpha(brand.cta.scan, 0.42),
    },
    overlay: {
      scrim: withAlpha(ink, 0.5),
    },
    accent: {
      brand: brand.cta.scan,
      brandStrong: evergreen.base,
      mascot: brand.pip.base,
      mascotAccent: brand.pip.accent,
      warm: brand.status.yellow,
    },
    action: {
      primary: {
        background: brand.cta.scan,
        foreground: neutral.white,
      },
      secondary: {
        background: foundations.color.neutral.white,
        foreground: ink,
      },
      quiet: {
        background: withAlpha(brand.pip.base, 0.2),
        foreground: evergreen.base,
      },
    },
    info: {
      background: '#EAF3F9',
      foreground: '#3D7397',
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
          foreground: '#256B4A',
          background: '#E3F2E8',
          tint: '#3E9B6E',
        },
        medium: {
          foreground: '#8F5A16',
          background: brand.status.mediumBackground,
          tint: brand.status.orange,
        },
        high: {
          foreground: '#A33B26',
          background: '#FBE3DC',
          tint: brand.status.red,
        },
      },
      // The five caseboard verdict tones. Text on `background` always uses
      // `foreground` (text-grade contrast); `tint` is for fills, meters, and
      // dots only. Cleared is deliberately the deepest green — the earned
      // verdict outranks the hopeful one.
      verdict: {
        confirmed: {
          foreground: '#A33B26',
          background: '#FBE3DC',
          tint: brand.status.red,
        },
        suspect: {
          foreground: '#8F5A16',
          background: brand.status.mediumBackground,
          tint: brand.status.orange,
        },
        watching: {
          foreground: neutral.cool[800],
          background: neutral.warm[100],
          tint: neutral.cool[600],
        },
        safe: {
          foreground: '#256B4A',
          background: '#E3F2E8',
          tint: '#3E9B6E',
        },
        cleared: {
          foreground: evergreen.base,
          background: '#D7EBDD',
          tint: '#2E8058',
        },
      },
      success: {
        foreground: '#256B4A',
        background: '#E3F2E8',
      },
      warning: {
        foreground: '#8F5A16',
        background: '#FCF0D3',
      },
      danger: {
        foreground: '#A33B26',
        background: '#FBE3DC',
      },
    },
    icon: {
      primary: ink,
      muted: neutral.cool[600],
      inverse: neutral.white,
      accent: evergreen.bright,
      info: '#3D7397',
      danger: brand.status.red,
    },
    utility: {
      shadow: foundations.color.neutral.black,
      handle: withAlpha(ink, 0.12),
      white: foundations.color.neutral.white,
    },
  },
  type: {
    // Bricolage Grotesque owns anything with a voice — headlines, verdicts,
    // numerals. Figtree carries the quiet interface. Two families, one clear
    // hierarchy; no serifs.
    display: {
      hero: {
        fontFamily: foundations.typography.family.display,
        fontSize: 34,
        lineHeight: 40,
        letterSpacing: -0.6,
      } satisfies TextStyle,
      section: {
        fontFamily: foundations.typography.family.display,
        fontSize: 27,
        lineHeight: 32,
        letterSpacing: -0.4,
      } satisfies TextStyle,
      accent: {
        fontFamily: foundations.typography.family.displayBold,
        fontSize: 21,
        lineHeight: 26,
        letterSpacing: -0.2,
      } satisfies TextStyle,
      // Hero numerals — Gut Score, Daily Score, scan scores. Chunky and
      // confident; the number is the app's conclusion and stands like one.
      metric: {
        fontFamily: foundations.typography.family.display,
        fontSize: 48,
        lineHeight: 52,
        letterSpacing: -1,
      } satisfies TextStyle,
    },
    title: {
      screen: {
        fontFamily: foundations.typography.family.displayBold,
        fontSize: 24,
        lineHeight: 30,
        letterSpacing: -0.3,
      } satisfies TextStyle,
      card: {
        fontFamily: foundations.typography.family.displayBold,
        fontSize: 19,
        lineHeight: 25,
        letterSpacing: -0.2,
      } satisfies TextStyle,
      block: {
        fontFamily: foundations.typography.family.displaySemibold,
        fontSize: 17,
        lineHeight: 23,
        letterSpacing: -0.1,
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
  // Airy separation: cards are borderless, so lift comes from soft neutral
  // shadows — light enough that the canvas stays bright.
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
