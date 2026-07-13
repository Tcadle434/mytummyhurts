export type CustomCategory = 'conditions' | 'sensitivities' | 'symptoms';

export const CHECKIN_TIME_PRESETS: { label: string; hour: number }[] = [
  { label: 'Morning · 9am', hour: 9 },
  { label: 'Midday · 1pm', hour: 13 },
  { label: 'Evening · 6pm', hour: 18 },
  { label: 'Night · 9pm', hour: 21 },
];

export const CUSTOM_CATEGORY_COPY: Record<
  CustomCategory,
  { title: string; subtitle: string; placeholder: string }
> = {
  conditions: {
    title: 'Add a custom condition',
    subtitle: 'Add anything we should consider when personalizing your scans.',
    placeholder: "Example: SIBO, gastritis, Crohn's",
  },
  sensitivities: {
    title: 'Add a custom sensitivity',
    subtitle: 'Add any food or ingredient you think might bother you.',
    placeholder: 'Example: eggs, soy, coffee',
  },
  symptoms: {
    title: 'Add a custom symptom',
    subtitle: 'Add any symptom you want your daily reports to track.',
    placeholder: 'Example: cramping, burping, trapped gas',
  },
};
