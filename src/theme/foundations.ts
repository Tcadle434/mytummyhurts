export const foundations = {
  color: {
    brand: {
      pip: {
        base: '#96C8AE',
        accent: '#FDA38B',
      },
      ink: '#212B32',
      canvas: '#FDF7F1',
      surface: {
        default: '#FDFAF6',
        warm: '#FEF5EA',
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
        600: '#7E878D',
        700: '#727375',
        800: '#5E676D',
      },
    },
  },
  typography: {
    family: {
      display: 'InstrumentSerif_400Regular',
      bodyRegular: 'PlusJakartaSans_400Regular',
      bodyMedium: 'PlusJakartaSans_500Medium',
      bodySemibold: 'PlusJakartaSans_600SemiBold',
      bodyBold: 'PlusJakartaSans_700Bold',
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
    md: 18,
    lg: 24,
    xl: 30,
    xxl: 38,
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
