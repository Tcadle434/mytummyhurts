export const legalDocuments = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'What we collect',
        body:
          'MyTummyHurts stores the account details you provide, meal images or descriptions you choose to log, scan results, daily gut reports, and stomach-profile settings so the app can personalize future food risk reads.',
      },
      {
        heading: 'How we use it',
        body:
          'We use your data to analyze meals, show your food history, send optional daily report reminders, and improve your trigger and safe-food insights over time.',
      },
      {
        heading: 'Third-party processors',
        body:
          'Core infrastructure is self-hosted on our own servers. AI analysis requests are sent to OpenAI. Subscription purchase and entitlement management are handled by RevenueCat. Product analytics are handled by PostHog.',
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
        heading: 'Subscriptions and scan allowance',
        body:
          'Subscriptions unlock a monthly scan allowance, history, and insights. Unused monthly scans do not roll over. Prices, trials, and entitlements are managed through Apple in-app purchases.',
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
  science: {
    title: 'How the scoring works',
    sections: [
      {
        heading: 'Built on published gut-trigger research',
        body:
          'Risk scoring starts from a structured rubric of food categories and preparation styles linked to common digestive conditions (IBS, GERD/reflux, lactose intolerance, FODMAP sensitivity), informed by clinical guidance from sources like the NIDDK and the American College of Gastroenterology low-FODMAP recommendations.',
      },
      {
        heading: 'Personalized to you, honestly',
        body:
          'Your conditions, declared sensitivities, and calibration answers seed the model on day one. After that, evidence from your own days does the work: daily check-ins are matched against meals across same-day and multi-day windows, because gut symptoms often lag 6-48 hours. We never ask you to judge a single meal an hour after eating - that produces bias, not evidence.',
      },
      {
        heading: 'How patterns are grouped',
        body:
          'Digestive Patterns follow the clinical taxonomies dietitians use: FODMAP mechanisms such as fructans, GOS, lactose, excess fructose, and polyols, plus common reflux/irritation patterns such as high-fat meals, fried foods, acid, spice, caffeine, alcohol, carbonation, chocolate, mint, and fermented or aged foods. Tracked Food Families organize the rest of your logged foods for visibility. Related ingredients can share a pattern because they share one mechanism - and because the ACG notes trigger impact "varies significantly among individuals," patterns are confirmed or cleared by your own evidence, not a generic list.',
      },
      {
        heading: 'Confidence, not certainty',
        body:
          'Every trigger shows its evidence count and confidence level, and uncertain scans say so instead of promising "low risk." MyTummyHurts is informational guidance to support your own decisions - it is not a diagnosis, and it does not replace a clinician.',
      },
    ],
  },
} as const;
