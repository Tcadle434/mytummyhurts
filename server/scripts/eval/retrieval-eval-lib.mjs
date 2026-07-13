function normalized(value) {
  return String(value ?? '').trim().toLowerCase();
}

function documentText(chunk) {
  return normalized([chunk.title, chunk.sourceName, chunk.source, chunk.sourceUrl, chunk.url].filter(Boolean).join(' '));
}

function matchingExpectedDocuments(chunk, expectedDocuments) {
  const text = documentText(chunk);
  return expectedDocuments.filter((entry) => text.includes(normalized(entry)));
}

function roundMetric(value) {
  return Number(value.toFixed(4));
}

function dcg(relevance) {
  return relevance.reduce(
    (total, relevant, index) => total + (relevant ? 1 / Math.log2(index + 2) : 0),
    0,
  );
}

export function evaluateRetrievalCase(testCase, chunks, topK, defaults = {}) {
  const expectedDocuments = testCase.expectedDocuments ?? [];
  if (!expectedDocuments.length) throw new Error(`${testCase.id}: expectedDocuments must not be empty`);

  const ranked = chunks.slice(0, topK).map((chunk, index) => {
    const matchedDocuments = matchingExpectedDocuments(chunk, expectedDocuments);
    return {
      chunk,
      rank: index + 1,
      relevant: matchedDocuments.length > 0,
      matchedDocuments,
    };
  });
  const matchedDocuments = new Set(ranked.flatMap((entry) => entry.matchedDocuments));
  const relevantCount = ranked.filter((entry) => entry.relevant).length;
  const firstRelevant = ranked.find((entry) => entry.relevant)?.rank ?? null;
  const precisionAtK = roundMetric(relevantCount / topK);
  const recallAtK = roundMetric(matchedDocuments.size / expectedDocuments.length);
  const reciprocalRank = roundMetric(firstRelevant ? 1 / firstRelevant : 0);

  const seenForGain = new Set();
  const relevance = ranked.map((entry) => {
    const unseen = entry.matchedDocuments.find((document) => !seenForGain.has(document));
    if (!unseen) return 0;
    seenForGain.add(unseen);
    return 1;
  });
  const idealRelevant = Math.min(expectedDocuments.length, topK);
  const ideal = Array.from({ length: topK }, (_, index) => (index < idealRelevant ? 1 : 0));
  const idealDcg = dcg(ideal);
  const ndcgAtK = roundMetric(idealDcg ? dcg(relevance) / idealDcg : 0);

  const forbiddenHits = [];
  for (const forbidden of testCase.forbiddenDocuments ?? []) {
    for (const entry of ranked) {
      if (documentText(entry.chunk).includes(normalized(forbidden))) {
        forbiddenHits.push({ document: forbidden, rank: entry.rank, title: entry.chunk.title });
      }
    }
  }

  const requiredDirections = testCase.requiredDirections ?? [];
  const returnedDirections = new Set(ranked.map((entry) => entry.chunk.direction).filter(Boolean));
  const missingDirections = requiredDirections.filter((direction) => !returnedDirections.has(direction));
  const thresholds = {
    minPrecisionAtK: testCase.minPrecisionAtK ?? defaults.minPrecisionAtK ?? 0,
    minRecallAtK: testCase.minRecallAtK ?? defaults.minRecallAtK ?? 1,
    minReciprocalRank: testCase.minReciprocalRank ?? defaults.minReciprocalRank ?? 0,
    minNdcgAtK: testCase.minNdcgAtK ?? defaults.minNdcgAtK ?? 0,
  };
  const errors = [];
  if (precisionAtK < thresholds.minPrecisionAtK) {
    errors.push(`precision@${topK} ${precisionAtK} is below ${thresholds.minPrecisionAtK}`);
  }
  if (recallAtK < thresholds.minRecallAtK) {
    errors.push(`recall@${topK} ${recallAtK} is below ${thresholds.minRecallAtK}`);
  }
  if (reciprocalRank < thresholds.minReciprocalRank) {
    errors.push(`reciprocal rank ${reciprocalRank} is below ${thresholds.minReciprocalRank}`);
  }
  if (ndcgAtK < thresholds.minNdcgAtK) {
    errors.push(`nDCG@${topK} ${ndcgAtK} is below ${thresholds.minNdcgAtK}`);
  }
  if (forbiddenHits.length) {
    errors.push(
      `forbidden document(s) returned: ${forbiddenHits.map((hit) => `${hit.document}@${hit.rank}`).join(', ')}`,
    );
  }
  if (missingDirections.length) {
    errors.push(`missing required direction(s): ${missingDirections.join(', ')}`);
  }

  return {
    passed: errors.length === 0,
    errors,
    metrics: {
      precisionAtK,
      recallAtK,
      reciprocalRank,
      ndcgAtK,
      relevantChunkCount: relevantCount,
      matchedDocumentCount: matchedDocuments.size,
      expectedDocumentCount: expectedDocuments.length,
    },
    forbiddenHits,
    topChunks: ranked.map((entry) => ({
      rank: entry.rank,
      relevant: entry.relevant,
      matchedDocuments: entry.matchedDocuments,
      id: entry.chunk.chunkId ?? entry.chunk.id,
      title: entry.chunk.title,
      sourceName: entry.chunk.sourceName ?? entry.chunk.source,
      sourceUrl: entry.chunk.sourceUrl ?? entry.chunk.url,
      direction: entry.chunk.direction,
      rerankerScore: entry.chunk.rerankScore,
      preview: String(entry.chunk.content ?? '').slice(0, 240),
    })),
  };
}

function mean(values) {
  return values.length ? roundMetric(values.reduce((total, value) => total + value, 0) / values.length) : 0;
}

export function summarizeRetrievalResults(results) {
  return {
    total: results.length,
    passed: results.filter((result) => result.validation.passed).length,
    failed: results.filter((result) => !result.validation.passed).length,
    meanPrecisionAtK: mean(results.map((result) => result.validation.metrics.precisionAtK)),
    meanRecallAtK: mean(results.map((result) => result.validation.metrics.recallAtK)),
    meanReciprocalRank: mean(results.map((result) => result.validation.metrics.reciprocalRank)),
    meanNdcgAtK: mean(results.map((result) => result.validation.metrics.ndcgAtK)),
  };
}
