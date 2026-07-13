export type OpenAiUsageSnapshot = {
  responseId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
};

export type OpenAiPricingSnapshot = {
  pricingSchemaVersion: 'openai_pricing_v1';
  provider: 'openai';
  model: string;
  matchedModel: string | null;
  currency: 'USD';
  source: 'openai_api_pricing';
  sourceUrl: string;
  retrievedAt: string;
  ratesPerMillionTokens: {
    input: number;
    cachedInput: number | null;
    output: number;
  } | null;
  note?: string;
};

export type OpenAiCostSnapshot = {
  usage: OpenAiUsageSnapshot;
  pricingSnapshot: OpenAiPricingSnapshot;
  estimatedCostUsdMicros: number | null;
  billable: boolean;
};

type PricingRate = {
  input: number;
  cachedInput: number | null;
  output: number;
};

const PRICING_SCHEMA_VERSION = 'openai_pricing_v1';
const PRICING_SOURCE_URL = 'https://openai.com/api/pricing';
const PRICING_RETRIEVED_AT = '2026-06-22';

const MODEL_PRICING_USD_PER_1M_TOKENS: Record<string, PricingRate> = {
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  // gpt-5.4-mini is the default extraction model. Rates per openai.com/api/pricing.
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-4.1': { input: 2, cachedInput: 0.5, output: 8 },
  'gpt-4.1-mini': { input: 0.4, cachedInput: 0.1, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, cachedInput: 0.025, output: 0.4 },
  'gpt-4o': { input: 2.5, cachedInput: 1.25, output: 10 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  // Embeddings bill input tokens only.
  'text-embedding-3-small': { input: 0.02, cachedInput: null, output: 0 },
  'text-embedding-3-large': { input: 0.13, cachedInput: null, output: 0 },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  return rounded >= 0 ? rounded : null;
}

function pricingKeyForModel(model: string): string | null {
  if (MODEL_PRICING_USD_PER_1M_TOKENS[model]) {
    return model;
  }

  const dateSnapshotMatch = model.match(/^(gpt-(?:5|5\.4-mini|5-mini|5-nano|4\.1|4\.1-mini|4\.1-nano|4o|4o-mini))-\d{4}-\d{2}-\d{2}$/);
  return dateSnapshotMatch?.[1] && MODEL_PRICING_USD_PER_1M_TOKENS[dateSnapshotMatch[1]]
    ? dateSnapshotMatch[1]
    : null;
}

export function extractOpenAiUsage(rawResponseJson: unknown): OpenAiUsageSnapshot {
  const payload = asRecord(rawResponseJson);
  const usage = asRecord(payload?.usage);
  const inputDetails = asRecord(usage?.input_tokens_details);
  const outputDetails = asRecord(usage?.output_tokens_details);
  const inputTokens = nonNegativeInteger(usage?.input_tokens);
  const cachedInputTokens = Math.min(
    nonNegativeInteger(inputDetails?.cached_tokens) ?? 0,
    inputTokens ?? Number.MAX_SAFE_INTEGER,
  );
  const outputTokens = nonNegativeInteger(usage?.output_tokens);
  const reasoningTokens = Math.min(
    nonNegativeInteger(outputDetails?.reasoning_tokens) ?? 0,
    outputTokens ?? Number.MAX_SAFE_INTEGER,
  );
  const explicitTotalTokens = nonNegativeInteger(usage?.total_tokens);
  const derivedTotalTokens = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;

  return {
    responseId: typeof payload?.id === 'string' ? payload.id : null,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: explicitTotalTokens ?? derivedTotalTokens,
  };
}

export function estimateOpenAiCost(model: string, usage: OpenAiUsageSnapshot): OpenAiCostSnapshot {
  const matchedModel = pricingKeyForModel(model);
  const rates = matchedModel ? MODEL_PRICING_USD_PER_1M_TOKENS[matchedModel] : null;
  const pricingSnapshot: OpenAiPricingSnapshot = {
    pricingSchemaVersion: PRICING_SCHEMA_VERSION,
    provider: 'openai',
    model,
    matchedModel,
    currency: 'USD',
    source: 'openai_api_pricing',
    sourceUrl: PRICING_SOURCE_URL,
    retrievedAt: PRICING_RETRIEVED_AT,
    ratesPerMillionTokens: rates,
    ...(rates ? {} : { note: 'No local pricing rate matched this model; usage was stored without a cost estimate.' }),
  };

  if (!rates || usage.inputTokens === null || usage.outputTokens === null) {
    return {
      usage,
      pricingSnapshot,
      estimatedCostUsdMicros: null,
      billable: false,
    };
  }

  const cachedTokens = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const uncachedInputTokens = Math.max(usage.inputTokens - cachedTokens, 0);
  const cachedRate = rates.cachedInput ?? rates.input;
  const estimatedCostUsdMicros = Math.round(
    uncachedInputTokens * rates.input +
      cachedTokens * cachedRate +
      usage.outputTokens * rates.output,
  );

  return {
    usage,
    pricingSnapshot,
    estimatedCostUsdMicros,
    billable: usage.totalTokens !== null && usage.totalTokens > 0,
  };
}

export function aggregateOpenAiCostSnapshots(model: string, snapshots: OpenAiCostSnapshot[]): OpenAiCostSnapshot {
  const usage: OpenAiUsageSnapshot = {
    responseId: null,
    inputTokens: sumNullable(snapshots.map((snapshot) => snapshot.usage.inputTokens)),
    cachedInputTokens: sumNullable(snapshots.map((snapshot) => snapshot.usage.cachedInputTokens)),
    outputTokens: sumNullable(snapshots.map((snapshot) => snapshot.usage.outputTokens)),
    reasoningTokens: sumNullable(snapshots.map((snapshot) => snapshot.usage.reasoningTokens)),
    totalTokens: sumNullable(snapshots.map((snapshot) => snapshot.usage.totalTokens)),
  };
  const estimatedCostUsdMicros = sumNullable(snapshots.map((snapshot) => snapshot.estimatedCostUsdMicros));
  const pricingSnapshot = estimateOpenAiCost(model, usage).pricingSnapshot;

  return {
    usage,
    pricingSnapshot: {
      ...pricingSnapshot,
      note: 'Synthetic aggregate of page-level OpenAI audit rows. The aggregate row is not billable to avoid double counting.',
    },
    estimatedCostUsdMicros,
    billable: false,
  };
}

export function hasOpenAiTokenUsage(usage: OpenAiUsageSnapshot): boolean {
  return [
    usage.inputTokens,
    usage.outputTokens,
    usage.totalTokens,
  ].some((value) => typeof value === 'number' && value > 0);
}

export function estimateOpenAiRetryCost(
  model: string,
  rawResponses: unknown[],
): OpenAiCostSnapshot | null {
  const usageSnapshots = rawResponses.map(extractOpenAiUsage);
  const responseId = usageSnapshots.reduce<string | null>(
    (latest, usage) => usage.responseId ?? latest,
    null,
  );
  const snapshots = usageSnapshots
    .filter(hasOpenAiTokenUsage)
    .map((usage) => estimateOpenAiCost(model, usage));
  if (!snapshots.length) {
    if (!responseId) return null;
    return estimateOpenAiCost(model, {
      responseId,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
    });
  }
  if (snapshots.length === 1) {
    return {
      ...snapshots[0],
      usage: {
        ...snapshots[0].usage,
        responseId,
      },
    };
  }

  const aggregate = aggregateOpenAiCostSnapshots(model, snapshots);
  return {
    ...aggregate,
    usage: {
      ...aggregate.usage,
      responseId,
    },
    pricingSnapshot: {
      ...aggregate.pricingSnapshot,
      note: 'Synthetic aggregate of structured-output retry attempts.',
    },
    billable: snapshots.some((snapshot) => snapshot.billable),
  };
}

function sumNullable(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return numericValues.length ? numericValues.reduce((total, value) => total + value, 0) : null;
}
