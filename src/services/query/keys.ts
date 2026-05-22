export const queryKeys = {
  history: ['history'] as const,
  scan: (scanId: string) => ['scan', scanId] as const,
  insights: ['insights'] as const,
  home: ['home'] as const,
};
