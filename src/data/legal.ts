export const legalDocuments = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'What we collect',
        body:
          'MyTummyHurts stores the account details you provide, meal images or descriptions you choose to scan, scan results, follow-up answers, and stomach-profile settings so the app can personalize future food risk reads.',
      },
      {
        heading: 'How we use it',
        body:
          'We use your data to analyze meals, show your scan history, send optional meal follow-up notifications, and improve your trigger and safe-food insights over time.',
      },
      {
        heading: 'Third-party processors',
        body:
          'Core infrastructure is provided by Supabase. AI analysis requests are sent to OpenAI. Paywall and subscription presentation are handled by Superwall. Product analytics are handled by PostHog.',
      },
      {
        heading: 'Your controls',
        body:
          'You can update your stomach profile, disable notifications, or request account deletion from Settings. Deleting your account removes your app data from the active service.',
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      {
        heading: 'Informational only',
        body:
          'MyTummyHurts provides informational digestive-risk guidance based on meal inputs and prior feedback. It is not medical advice and should not replace a licensed clinician.',
      },
      {
        heading: 'Subscriptions and tokens',
        body:
          'Subscriptions unlock a monthly scan allowance, history, and insights. Unused monthly scan tokens do not roll over. Prices, trials, and entitlements are managed through Apple in-app purchases.',
      },
      {
        heading: 'User content',
        body:
          'You are responsible for the meal descriptions, photos, and symptom notes you submit. Do not upload content you do not have the right to use.',
      },
      {
        heading: 'Support',
        body:
          'If you have account, billing, or data questions, use the support contact shown in Settings.',
      },
    ],
  },
} as const;
