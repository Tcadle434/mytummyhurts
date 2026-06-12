import {
  aggregateOpenAiCostSnapshots,
  estimateOpenAiCost,
  extractOpenAiUsage,
} from './openaiPricing.ts';

Deno.test('extractOpenAiUsage pulls Responses API usage fields', () => {
  const usage = extractOpenAiUsage({
    id: 'resp_test',
    usage: {
      input_tokens: 1000,
      input_tokens_details: { cached_tokens: 200 },
      output_tokens: 100,
      output_tokens_details: { reasoning_tokens: 10 },
      total_tokens: 1100,
    },
  });

  if (usage.responseId !== 'resp_test') {
    throw new Error(`Expected response id resp_test, got ${usage.responseId ?? 'null'}`);
  }
  if (usage.inputTokens !== 1000 || usage.cachedInputTokens !== 200 || usage.outputTokens !== 100) {
    throw new Error(`Unexpected token usage: ${JSON.stringify(usage)}`);
  }
  if (usage.reasoningTokens !== 10 || usage.totalTokens !== 1100) {
    throw new Error(`Unexpected detailed token usage: ${JSON.stringify(usage)}`);
  }
});

Deno.test('estimateOpenAiCost calculates gpt-5-mini cached input and output cost in micros', () => {
  const usage = extractOpenAiUsage({
    id: 'resp_test',
    usage: {
      input_tokens: 1000,
      input_tokens_details: { cached_tokens: 200 },
      output_tokens: 100,
      output_tokens_details: { reasoning_tokens: 10 },
      total_tokens: 1100,
    },
  });
  const cost = estimateOpenAiCost('gpt-5-mini', usage);

  if (cost.estimatedCostUsdMicros !== 405) {
    throw new Error(`Expected 405 micros, got ${cost.estimatedCostUsdMicros ?? 'null'}`);
  }
  if (!cost.billable) {
    throw new Error('Expected completed usage with known pricing to be billable.');
  }
  if (cost.pricingSnapshot.matchedModel !== 'gpt-5-mini') {
    throw new Error(`Expected gpt-5-mini pricing, got ${cost.pricingSnapshot.matchedModel ?? 'null'}`);
  }
});

Deno.test('estimateOpenAiCost stores usage without cost for unknown models', () => {
  const usage = extractOpenAiUsage({
    id: 'resp_unknown',
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    },
  });
  const cost = estimateOpenAiCost('unknown-model', usage);

  if (cost.estimatedCostUsdMicros !== null) {
    throw new Error(`Expected null cost for unknown model, got ${cost.estimatedCostUsdMicros}`);
  }
  if (cost.billable) {
    throw new Error('Expected unknown pricing to be non-billable for cost rollups.');
  }
  if (!cost.pricingSnapshot.note) {
    throw new Error('Expected pricing snapshot to explain missing pricing.');
  }
});

Deno.test('aggregateOpenAiCostSnapshots sums page usage without making synthetic row billable', () => {
  const first = estimateOpenAiCost('gpt-5-mini', extractOpenAiUsage({
    id: 'resp_1',
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
  }));
  const second = estimateOpenAiCost('gpt-5-mini', extractOpenAiUsage({
    id: 'resp_2',
    usage: { input_tokens: 50, output_tokens: 10, total_tokens: 60 },
  }));
  const aggregate = aggregateOpenAiCostSnapshots('gpt-5-mini', [first, second]);

  if (aggregate.usage.totalTokens !== 180) {
    throw new Error(`Expected 180 aggregate tokens, got ${aggregate.usage.totalTokens ?? 'null'}`);
  }
  if (aggregate.estimatedCostUsdMicros !== first.estimatedCostUsdMicros! + second.estimatedCostUsdMicros!) {
    throw new Error(`Unexpected aggregate cost: ${aggregate.estimatedCostUsdMicros ?? 'null'}`);
  }
  if (aggregate.billable) {
    throw new Error('Expected synthetic aggregate audit row to be non-billable.');
  }
});
