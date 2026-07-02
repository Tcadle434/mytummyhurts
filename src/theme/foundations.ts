// Deep Garden — the app's design language.
//
// One anchor: deep evergreen, used as SURFACES (hero cards, primary actions),
// not just text. Porcelain canvas, pure white cards, and Pip's own mint/peach
// as the accents that glow against the dark green. Type is Bricolage Grotesque
// for anything with a voice (headlines, verdicts, numerals) and Figtree for
// the quiet interface around it. No decorative extras — depth comes from
// color-blocking.
export const foundations = {
  color: {
    brand: {
      pip: {
        base: '#96C8AE',
        accent: '#FDA38B',
      },
      // Green-cast ink: reads near-black but belongs to the garden.
      ink: '#1A2E26',
      evergreen: {
        deep: '#0C2E22',
        base: '#12402F',
        bright: '#1B5A40',
        onDeep: '#F7F6F2',
        onDeepMuted: 'rgba(247, 246, 242, 0.72)',
        onDeepFaint: 'rgba(247, 246, 242, 0.45)',
      },
      canvas: '#F7F6F2',
      surface: {
        default: '#FFFFFF',
        warm: '#F4F0E7',
      },
      cta: {
        scan: '#12402F',
      },
      info: {
        blue: '#8FBFDD',
      },
      status: {
        red: '#D95B43',
        yellow: '#F2C14E',
        orange: '#E8973F',
        mediumBackground: '#FCEFD9',
      },
    },
    neutral: {
      white: '#FFFFFF',
      black: '#000000',
      warm: {
        0: '#FFFFFF',
        50: '#FAF9F6',
        100: '#F2F1EC',
        200: '#E4E2DA',
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
