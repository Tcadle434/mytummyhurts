import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineStructuredOutput, requestStructuredOutput } from '../src/llm/structured-output';
import { riskAdjudicationStructuredOutputForConditions } from '../src/scan/engine/openaiSchemas';

function responseWithOutput(output: unknown, id: string) {
  return new Response(JSON.stringify({
    id,
    status: 'completed',
    output_text: JSON.stringify(output),
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  }), { status: 200 });
}

function mealPayload(overrides: Record<string, unknown> = {}) {
  return {
    dishName: 'tomato pasta',
    dishConfidence: 'high',
    clarity: 'clear',
    unclearReason: null,
    components: [{ name: 'pasta', confidence: 'high', prepStyle: ['boiled'] }],
    visibleIngredients: [
      {
        rawName: 'tomato sauce',
        canonicalName: 'tomato sauce',
        confidence: 'high',
        component: 'sauce',
        evidence: 'visible',
        role: 'condiment',
        prominence: 'primary',
        amountEstimate: 'standard',
        amountBasis: 'coats the pasta',
      },
    ],
    inferredIngredients: [],
    prepStyle: ['boiled'],
    notes: [],
    baseFoodCategory: {
      key: 'wheat_grain_based',
      confidence: 'high',
      evidence: 'name',
      source: 'pasta',
    },
    riskModifiers: [],
    conditionSeverities: [
      { condition: 'GERD', band: 'moderate', drivers: ['tomato sauce'], rationale: 'Acidic sauce.' },
    ],
    dietFitHypotheses: [],
    ...overrides,
  };
}

function menuPayload(overrides: Record<string, unknown> = {}) {
  return {
    isMenu: true,
    notMenuReason: null,
    menuTitle: 'Dinner',
    menuConfidence: 'high',
    items: [
      {
        id: 'item-1',
        name: 'Rice bowl',
        description: 'Rice and chicken',
        section: 'Mains',
        price: '$12',
        baseFoodCategory: {
          key: 'mixed_dish_or_entree',
          confidence: 'high',
          evidence: 'description',
          source: 'rice and chicken',
        },
        riskModifiers: [],
        conditionSeverities: [],
        dietFitHypotheses: [],
        ingredientCallouts: ['rice', 'chicken'],
        prepStyle: ['grilled'],
        confidence: 'high',
      },
    ],
    ...overrides,
  };
}

function riskAdjudicationCondition(condition: string) {
  return {
    condition,
    genericBand: 'mild',
    personalizedBand: 'mild',
    finalBand: 'mild',
    drivers: [],
    protectiveEvidence: [],
    citationChunkIds: [],
    personalEvidenceUsed: [],
    confidence: 'medium',
    rationale: 'Representative condition row.',
  };
}

describe('structured output retries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.OPENAI_API_KEY = '';
    vi.resetModules();
  });

  it('preserves a string input when appending corrective feedback', async () => {
    const definition = defineStructuredOutput(
      'string_input_retry',
      z.object({ category: z.enum(['food', 'menu']) }).strict(),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput({ category: 'RAW_OUTPUT_MUST_NOT_BE_RESENT' }, 'resp-invalid'))
      .mockResolvedValueOnce(responseWithOutput({ category: 'food' }, 'resp-valid'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await requestStructuredOutput({
      apiKey: 'test-key',
      stage: 'string_input_retry',
      timeoutMs: 1_000,
      retryDelayMs: 0,
      definition,
      request: {
        model: 'gpt-test',
        input: 'ORIGINAL_STRING_INPUT',
        text: { format: definition.format },
      },
    });

    expect(result.value).toEqual({ category: 'food' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(retryRequest.input[0]).toEqual({
      role: 'user',
      content: [{ type: 'input_text', text: 'ORIGINAL_STRING_INPUT' }],
    });
    expect(JSON.stringify(retryRequest)).not.toContain('RAW_OUTPUT_MUST_NOT_BE_RESENT');
  });

  it('regenerates an invalid scan classification instead of coercing it into a food result', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput({ category: 'receipt', confidence: 'high', reason: 'invalid enum' }, 'resp-invalid'))
      .mockResolvedValueOnce(responseWithOutput({ category: 'menu', confidence: 'high', reason: 'menu pages' }, 'resp-valid'));
    vi.stubGlobal('fetch', fetchMock);
    const { classifyScanImagesWithAudit } = await import('../src/scan/engine/openai');

    const result = await classifyScanImagesWithAudit(['data:image/png;base64,abc']);

    expect(result.result.category).toBe('menu');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a scoring-critical food validation failure and aggregates retry audit usage', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const invalid = mealPayload({
      dishName: 'DO_NOT_RESEND_PREVIOUS_OUTPUT',
      conditionSeverities: [
        { condition: 'GERD', band: 'high', drivers: [], rationale: 'Unsupported high band.' },
      ],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput(invalid, 'resp-food-invalid'))
      .mockResolvedValueOnce(responseWithOutput(mealPayload(), 'resp-food-valid'));
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { extractMealFromTextWithAudit } = await import('../src/scan/engine/openai');

    const result = await extractMealFromTextWithAudit('tomato pasta', {
      knownConditions: ['GERD'],
      knownIngredients: [],
    });

    expect(result.result.dishName).toBe('tomato pasta');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = String(fetchMock.mock.calls[1]?.[1]?.body);
    expect(retryBody).toContain('$.conditionSeverities[0].drivers');
    expect(retryBody).not.toContain('DO_NOT_RESEND_PREVIOUS_OUTPUT');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('DO_NOT_RESEND_PREVIOUS_OUTPUT');
    expect(result.audits[0]).toMatchObject({
      status: 'completed',
      totalTokens: 30,
      requestMetadata: {
        attemptCount: 2,
        validationIssues: [
          {
            path: '$.conditionSeverities[0].drivers',
            message: 'Moderate, high, and severe condition bands require at least one supporting driver.',
          },
        ],
      },
    });
    expect(result.audits[0]?.normalizedResponseJson).toEqual(result.result);
    expect(result.audits[0]?.rawResponseJson).toMatchObject({
      attempts: [{ id: 'resp-food-invalid' }, { id: 'resp-food-valid' }],
    });
  });

  it('regenerates a menu with a blank critical item identifier', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const invalidItem = { ...menuPayload().items[0], id: '   ' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput(menuPayload({ items: [invalidItem] }), 'resp-menu-invalid'))
      .mockResolvedValueOnce(responseWithOutput(menuPayload(), 'resp-menu-valid'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { extractMenuFromImagesWithAudit } = await import('../src/scan/engine/openai');

    const result = await extractMenuFromImagesWithAudit(['data:image/png;base64,menu'], {
      knownConditions: [],
      knownIngredients: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.result.items[0]).toMatchObject({ id: 'item-1', name: 'Rice bowl' });
    expect(result.audits[0]?.requestMetadata).toMatchObject({ attemptCount: 2 });
  });

  it('retries malformed JSON and missing output before accepting a complete response', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp-malformed',
        status: 'completed',
        output_text: '{',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp-missing',
        status: 'completed',
        output: [],
      }), { status: 200 }))
      .mockResolvedValueOnce(responseWithOutput({
        category: 'food',
        confidence: 'high',
        reason: 'single plate',
      }, 'resp-valid'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { classifyScanImagesWithAudit } = await import('../src/scan/engine/openai');

    const result = await classifyScanImagesWithAudit(['data:image/png;base64,abc']);

    expect(result.result.category).toBe('food');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.audits[0]?.requestMetadata).toMatchObject({
      attemptCount: 3,
      validationIssues: expect.arrayContaining([
        { path: '$', message: 'Response must be valid JSON.' },
        { path: '$', message: 'Response must include the complete JSON object.' },
      ]),
    });
  });

  it('regenerates omitted and duplicate canonical risk adjudication conditions', async () => {
    const definition = riskAdjudicationStructuredOutputForConditions(['GERD', 'IBS']);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput({
        conditionSeverities: [riskAdjudicationCondition('GERD')],
      }, 'resp-risk-omitted'))
      .mockResolvedValueOnce(responseWithOutput({
        conditionSeverities: [
          riskAdjudicationCondition('GERD'),
          riskAdjudicationCondition(' gerd '),
          riskAdjudicationCondition('IBS'),
        ],
      }, 'resp-risk-duplicate'))
      .mockResolvedValueOnce(responseWithOutput({
        conditionSeverities: [
          riskAdjudicationCondition('GERD'),
          riskAdjudicationCondition('IBS'),
        ],
      }, 'resp-risk-valid'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await requestStructuredOutput({
      apiKey: 'test-key',
      stage: 'risk_adjudication',
      timeoutMs: 1_000,
      retryDelayMs: 0,
      definition,
      request: {
        model: 'gpt-test',
        input: 'ORIGINAL_RISK_INPUT',
        text: { format: definition.format },
      },
    });

    expect(result.value.conditionSeverities.map((row) => row.condition)).toEqual(['GERD', 'IBS']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses canonical requested conditions in the adjudication prompt, schema, and audit', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const fetchMock = vi.fn(async () => responseWithOutput({
      conditionSeverities: [riskAdjudicationCondition('GERD')],
    }, 'resp-risk-canonical'));
    vi.stubGlobal('fetch', fetchMock);
    const { adjudicateScanRiskWithAudit } = await import('../src/scan/engine/openai');

    const result = await adjudicateScanRiskWithAudit({
      structuredAnalysis: {
        ...mealPayload(),
        model: 'gpt-test',
        promptVersion: 'test',
        imageDetail: 'not_applicable',
      },
      knownConditions: [' GERD ', 'acid reflux', ' '],
      personalEvidence: [],
      ragEvidence: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const userPrompt = request.input[1].content[0].text;
    expect(userPrompt).toContain('"knownConditions":["GERD / Acid reflux"]');
    expect(request.text.format.schema.properties.conditionSeverities).toMatchObject({
      minItems: 1,
      maxItems: 1,
    });
    expect(result.audits[0]).toMatchObject({
      userPrompt,
      requestMetadata: { conditionCount: 1 },
    });
  });

  it('fails with ai_request_failed after three invalid outputs and exposes only a failed audit', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const fetchMock = vi.fn(async (_url, options) => {
      expect(String(options?.body)).not.toContain('RAW_OUTPUT_MUST_NOT_BE_RESENT');
      return responseWithOutput({
        category: 'RAW_OUTPUT_MUST_NOT_BE_RESENT',
        confidence: 'high',
        reason: 'bad',
      }, 'resp-invalid');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { classifyScanImagesWithAudit } = await import('../src/scan/engine/openai');

    let thrown: Error & { audit?: Record<string, unknown> };
    try {
      await classifyScanImagesWithAudit(['data:image/png;base64,abc']);
      throw new Error('expected classification to fail');
    } catch (error) {
      thrown = error as Error & { audit?: Record<string, unknown> };
    }

    expect(thrown.message).toBe('openai_request_failed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(thrown.audit).toMatchObject({
      status: 'failed',
      parsedResponseJson: null,
      errorCode: 'openai_validation_failed',
      requestMetadata: { attemptCount: 3 },
    });
  });

  it('keeps raw model values out of validation error cause chains', async () => {
    const definition = defineStructuredOutput(
      'sanitized_validation_failure',
      z.object({ category: z.enum(['food', 'menu']) }).strict(),
    );
    const fetchMock = vi.fn(async () => responseWithOutput({
      category: 'SECRET_MODEL_VALUE',
    }, 'resp-secret-invalid'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    let thrown: unknown;
    try {
      await requestStructuredOutput({
        apiKey: 'test-key',
        stage: 'sanitized_validation_failure',
        timeoutMs: 1_000,
        attempts: 1,
        retryDelayMs: 0,
        definition,
        request: {
          model: 'gpt-test',
          input: 'ORIGINAL_INPUT',
          text: { format: definition.format },
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const causeMessages: string[] = [];
    let cause = thrown;
    while (cause instanceof Error) {
      causeMessages.push(cause.message);
      cause = cause.cause;
    }
    expect(causeMessages).toEqual(['openai_request_failed', 'openai_validation_failed']);
    expect(causeMessages.join(' ')).not.toContain('SECRET_MODEL_VALUE');
  });

  it('retries a transient HTTP error but not a hard 4xx or model refusal', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { classifyScanImagesWithAudit } = await import('../src/scan/engine/openai');

    const transientFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 }))
      .mockResolvedValueOnce(responseWithOutput({ category: 'food', confidence: 'high', reason: 'plate' }, 'resp-ok'));
    vi.stubGlobal('fetch', transientFetch);
    await expect(classifyScanImagesWithAudit(['data:image/png;base64,abc'])).resolves.toMatchObject({
      result: { category: 'food' },
    });
    expect(transientFetch).toHaveBeenCalledTimes(2);

    const networkFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(responseWithOutput({ category: 'food', confidence: 'high', reason: 'plate' }, 'resp-network-ok'));
    vi.stubGlobal('fetch', networkFetch);
    await expect(classifyScanImagesWithAudit(['data:image/png;base64,abc'])).resolves.toMatchObject({
      result: { category: 'food' },
    });
    expect(networkFetch).toHaveBeenCalledTimes(2);

    const hardFetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 }));
    vi.stubGlobal('fetch', hardFetch);
    await expect(classifyScanImagesWithAudit(['data:image/png;base64,abc'])).rejects.toThrow('openai_error:400:');
    expect(hardFetch).toHaveBeenCalledTimes(1);

    const refusalFetch = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp-refusal',
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'cannot comply' }] }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', refusalFetch);
    await expect(classifyScanImagesWithAudit(['data:image/png;base64,abc'])).rejects.toThrow('openai_request_failed');
    expect(refusalFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry content-filtered or invalid-request response envelopes', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { classifyScanImagesWithAudit } = await import('../src/scan/engine/openai');

    const contentFilterFetch = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp-content-filter',
      status: 'incomplete',
      incomplete_details: { reason: 'content_filter' },
      output: [],
    }), { status: 200 }));
    vi.stubGlobal('fetch', contentFilterFetch);
    await expect(classifyScanImagesWithAudit(['data:image/png;base64,abc'])).rejects.toMatchObject({
      message: 'openai_request_failed',
      audit: {
        errorCode: 'openai_incomplete_output',
        openaiResponseId: 'resp-content-filter',
        requestMetadata: { attemptCount: 1 },
      },
    });
    expect(contentFilterFetch).toHaveBeenCalledTimes(1);

    const invalidPromptFetch = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp-invalid-prompt',
      status: 'failed',
      error: { code: 'invalid_prompt', message: 'Invalid prompt.' },
      output: [],
    }), { status: 200 }));
    vi.stubGlobal('fetch', invalidPromptFetch);
    await expect(classifyScanImagesWithAudit(['data:image/png;base64,abc'])).rejects.toMatchObject({
      message: 'openai_request_failed',
      audit: {
        errorCode: 'openai_missing_output',
        openaiResponseId: 'resp-invalid-prompt',
        requestMetadata: { attemptCount: 1 },
      },
    });
    expect(invalidPromptFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the final response ID when only an earlier retry has usage', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { classifyScanImagesWithAudit } = await import('../src/scan/engine/openai');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp-token-limit',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp-invalid-prompt-final',
        status: 'failed',
        error: { code: 'invalid_prompt', message: 'Invalid prompt.' },
        output: [],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(classifyScanImagesWithAudit(['data:image/png;base64,abc'])).rejects.toMatchObject({
      message: 'openai_request_failed',
      audit: {
        errorCode: 'openai_missing_output',
        openaiResponseId: 'resp-invalid-prompt-final',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        requestMetadata: { attemptCount: 2 },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries token-limit and transient response failure envelopes', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { classifyScanImagesWithAudit } = await import('../src/scan/engine/openai');

    const tokenLimitFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp-token-limit',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
      }), { status: 200 }))
      .mockResolvedValueOnce(responseWithOutput({
        category: 'food',
        confidence: 'high',
        reason: 'plate',
      }, 'resp-token-limit-ok'));
    vi.stubGlobal('fetch', tokenLimitFetch);
    await expect(classifyScanImagesWithAudit(['data:image/png;base64,abc'])).resolves.toMatchObject({
      result: { category: 'food' },
    });
    expect(tokenLimitFetch).toHaveBeenCalledTimes(2);

    const transientFailureFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp-server-error',
        status: 'incomplete',
        incomplete_details: null,
        error: { code: 'server_error', message: 'Temporary server error.' },
        output: [],
      }), { status: 200 }))
      .mockResolvedValueOnce(responseWithOutput({
        category: 'food',
        confidence: 'high',
        reason: 'plate',
      }, 'resp-server-error-ok'));
    vi.stubGlobal('fetch', transientFailureFetch);
    await expect(classifyScanImagesWithAudit(['data:image/png;base64,abc'])).resolves.toMatchObject({
      result: { category: 'food' },
    });
    expect(transientFailureFetch).toHaveBeenCalledTimes(2);
  });
});
