// Deep Garden, daylight revision — the app's design language.
//
// The garden stays; the lights come on. Warm cream canvas, white cards, and
// one WARM hero block per screen (peach-cream, never dark). Evergreen is
// demoted from surface to accent: it lives in headings, icons, wordmarks and
// small fills, and must never be a background that dominates a screen. The
// one sanctioned dark surface left in the app is the camera viewfinder,
// which is dark because video is dark. Pip's mint and peach carry the
// warmth. Type is unchanged: Bricolage Grotesque for anything with a voice
// (headlines, verdicts, numerals) and Figtree for the quiet interface
// around it.
export const foundations = {
  color: {
    brand: {
      pip: {
        base: '#96C8AE',
        accent: '#FDA38B',
      },
      // Green-cast ink: reads near-black but belongs to the garden.
      ink: '#1A2E26',
      // Accent scale only — text, icons, tiny fills. Not a surface.
      evergreen: {
        deep: '#0C2E22',
        base: '#12402F',
        bright: '#1B5A40',
        onDeep: '#F7F6F2',
        onDeepMuted: 'rgba(247, 246, 242, 0.72)',
        onDeepFaint: 'rgba(247, 246, 242, 0.45)',
      },
      canvas: '#FDF7F1',
      surface: {
        default: '#FFFFFF',
        warm: '#FEF5EA',
      },
      // The hero block: the screen's one warm patch of daylight.
      hero: {
        base: '#FDF0DE',
        deep: '#FBE6CC',
      },
      cta: {
        scan: '#5BA687',
      },
      info: {
        blue: '#9FCBE6',
      },
      status: {
        red: '#F5634A',
        yellow: '#F9C872',
        orange: '#FB913A',
        mediumBackground: '#FEEACB',
      },
    },
    neutral: {
      white: '#FFFFFF',
      black: '#000000',
      warm: {
        0: '#FFFDF9',
        50: '#FDF9F4',
        100: '#FBF3EA',
        200: '#ECE4D9',
      },
      cool: {
        600: '#6E7A74',
        700: '#57635D',
        800: '#3E4A44',
      },
    },
  },
  typography: {
    family: {
      display: 'BricolageGrotesque_800ExtraBold',
      displayBold: 'BricolageGrotesque_700Bold',
      displaySemibold: 'BricolageGrotesque_600SemiBold',
      bodyRegular: 'Figtree_400Regular',
      bodyMedium: 'Figtree_500Medium',
      bodySemibold: 'Figtree_600SemiBold',
      bodyBold: 'Figtree_700Bold',
    },
  },
  space: {
    xxs: 4,
    xs: 6,
    sm: 10,
    md: 16,
    lg: 22,
    xl: 30,
    xxl: 40,
    xxxl: 52,
  },
  radius: {
    sm: 12,
    md: 16,
    lg: 22,
    xl: 28,
    xxl: 34,
    pill: 999,
  },
  motion: {
    duration: {
      fast: 140,
      standard: 220,
      slow: 360,
    },
    easing: {
      standard: 'easeInOut',
      enter: 'easeOut',
      exit: 'easeIn',
    },
    scale: {
      press: 0.97,
    },
  },
} as const;
