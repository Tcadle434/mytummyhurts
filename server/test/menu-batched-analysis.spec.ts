import { afterEach, describe, expect, it, vi } from 'vitest';

function responseWithOutput(output: unknown, id: string) {
  return new Response(JSON.stringify({
    id,
    status: 'completed',
    output_text: JSON.stringify(output),
    usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
  }), { status: 200 });
}

function transcription(itemCount: number) {
  return {
    isMenu: true,
    notMenuReason: null,
    menuTitle: 'Dinner',
    menuConfidence: 'high',
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `item-${index + 1}`,
      name: `Dish ${index + 1}`,
      description: 'Grilled chicken with rice',
      section: 'Mains',
      price: '$12',
    })),
  };
}

function analyzedItem(id: string, conditionKey = 'general') {
  return {
    id,
    baseFoodCategory: {
      key: 'mixed_dish_or_entree',
      confidence: 'high',
      evidence: 'description',
      source: 'chicken with rice',
    },
    riskModifiers: [],
    conditionSeverities: [{ conditionKey, band: 'none', drivers: [] }],
    dietFitHypotheses: [],
    ingredientCallouts: ['chicken', 'rice'],
    prepStyle: ['grilled'],
    confidence: 'high',
  };
}

function analysisBatch(ids: string[]) {
  return { items: ids.map((id) => analyzedItem(id)) };
}

describe('bounded menu LLM analysis', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.OPENAI_API_KEY = '';
    delete process.env.OPENAI_MENU_ANALYSIS_BATCH_SIZE;
    delete process.env.OPENAI_MENU_STAGE_CONCURRENCY;
    vi.resetModules();
  });

  it('transcribes once and analyzes a large menu in bounded text-only batches', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MENU_ANALYSIS_BATCH_SIZE = '12';
    process.env.OPENAI_MENU_STAGE_CONCURRENCY = '2';
    vi.resetModules();
    const items = transcription(25);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput(items, 'transcription'))
      .mockResolvedValueOnce(responseWithOutput(analysisBatch(items.items.slice(0, 12).map((item) => item.id)), 'batch-1'))
      .mockResolvedValueOnce(responseWithOutput(analysisBatch(items.items.slice(12, 24).map((item) => item.id)), 'batch-2'))
      .mockResolvedValueOnce(responseWithOutput(analysisBatch(items.items.slice(24).map((item) => item.id)), 'batch-3'));
    vi.stubGlobal('fetch', fetchMock);
    const { extractMenuFromImagesWithAudit } = await import('../src/scan/engine/openai');

    const result = await extractMenuFromImagesWithAudit(['data:image/jpeg;base64,menu'], {
      knownConditions: [],
      knownIngredients: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.result.items).toHaveLength(25);
    expect(result.audits.map((audit) => audit.stage)).toEqual([
      'menu_transcription',
      'menu_item_analysis_batch',
      'menu_item_analysis_batch',
      'menu_item_analysis_batch',
    ]);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('input_image');
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(String(call[1]?.body)).not.toContain('input_image');
    }
  });

  it('regenerates an incomplete LLM batch before scoring any menu item', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const menu = transcription(2);
    const complete = analysisBatch(menu.items.map((item) => item.id));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput(menu, 'transcription'))
      .mockResolvedValueOnce(responseWithOutput({ items: [complete.items[0]] }, 'incomplete'))
      .mockResolvedValueOnce(responseWithOutput(complete, 'complete'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { extractMenuFromImagesWithAudit } = await import('../src/scan/engine/openai');

    const result = await extractMenuFromImagesWithAudit(['data:image/jpeg;base64,menu'], {
      knownConditions: [],
      knownIngredients: [],
    });

    expect(result.result.items).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.audits[1]?.requestMetadata).toMatchObject({
      attemptCount: 2,
      validationIssues: expect.arrayContaining([{
        path: '$.items',
        message: 'Must contain at least 2 items.',
      }]),
    });
  });

  it('uses stable condition keys and restores the exact profile label before scoring', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const menu = transcription(1);
    const analysis = {
      items: menu.items.map((item) => analyzedItem(item.id, 'general_discomfort')),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput(menu, 'transcription'))
      .mockResolvedValueOnce(responseWithOutput(analysis, 'analysis'));
    vi.stubGlobal('fetch', fetchMock);
    const { extractMenuFromImagesWithAudit } = await import('../src/scan/engine/openai');

    const result = await extractMenuFromImagesWithAudit(['data:image/jpeg;base64,menu'], {
      knownConditions: ['Unsure, just general discomfort'],
      knownIngredients: [],
      commonSymptoms: ['Gas'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.result.items[0]?.conditionSeverities).toEqual([{
      condition: 'Unsure, just general discomfort',
      band: 'none',
      drivers: [],
    }]);
    const analysisBody = String(fetchMock.mock.calls[1]?.[1]?.body);
    expect(analysisBody).toContain('general_discomfort');
    expect(analysisBody).toContain('Gas');
  });

  it('fails after three incomplete batches instead of serving fallback scores', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const menu = transcription(2);
    const incomplete = analysisBatch([menu.items[0].id]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput(menu, 'transcription'))
      .mockResolvedValueOnce(responseWithOutput(incomplete, 'incomplete-1'))
      .mockResolvedValueOnce(responseWithOutput(incomplete, 'incomplete-2'))
      .mockResolvedValueOnce(responseWithOutput(incomplete, 'incomplete-3'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { extractMenuFromImagesWithAudit } = await import('../src/scan/engine/openai');

    await expect(extractMenuFromImagesWithAudit(['data:image/jpeg;base64,menu'], {
      knownConditions: [],
      knownIngredients: [],
    })).rejects.toThrow('openai_request_failed');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
