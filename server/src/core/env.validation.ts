/**
 * Startup environment validation, wired into ConfigModule.forRoot({ validate }).
 * Fail-fast policy: a misconfigured server must crash at boot, never limp along
 * fabricating results (the old behavior silently served demo meals when
 * OPENAI_API_KEY was absent).
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const isDemoMode = config.DEMO_MODE === 'true';
  const openAiApiKey = typeof config.OPENAI_API_KEY === 'string' ? config.OPENAI_API_KEY.trim() : '';

  if (!openAiApiKey && !isDemoMode) {
    throw new Error(
      'OPENAI_API_KEY is not set. Scans cannot run without it. ' +
        'Set the key, or set DEMO_MODE=true to explicitly opt in to fabricated demo extractions (never in production).',
    );
  }

  return config;
}
