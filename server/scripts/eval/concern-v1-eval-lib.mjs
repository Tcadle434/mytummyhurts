import { createHash } from 'node:crypto';

export function parseConcernEvalArgs(argv) {
  const parsed = { tier: 'full', shardIndex: 0, plan: false, caseIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--tier') parsed.tier = argv[++index];
    else if (value === '--shard-index') parsed.shardIndex = Number(argv[++index]);
    else if (value === '--case') parsed.caseIds.push(...String(argv[++index]).split(',').filter(Boolean));
    else if (value === '--plan') parsed.plan = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return parsed;
}

export function concernRunsHaveOperationalFailure(...runs) {
  return runs.some((run) => run?.result?.status !== 'completed');
}

function stableRank(value) {
  return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);
}

function assertExactSelection(selected, wanted, label) {
  if (selected.length !== wanted.size) {
    const found = new Set(selected.map((entry) => entry.id));
    const missing = [...wanted].filter((id) => !found.has(id));
    throw new Error(`${label} contains unknown ids: ${missing.join(', ')}`);
  }
}

export function selectConcernCases(all, suites, options) {
  if (options.caseIds.length) {
    const wanted = new Set(options.caseIds);
    const selected = all.filter((entry) => wanted.has(entry.id));
    assertExactSelection(selected, wanted, 'Explicit concern eval selection');
    return selected;
  }
  const suite = suites.tiers[options.tier];
  if (!suite) throw new Error(`Unknown concern eval tier: ${options.tier}`);
  if (options.tier === 'full') return all;
  if (options.tier === 'nightly') {
    const anchors = new Set(suite.anchorCaseIds ?? []);
    const shardCount = Number(suite.shardCount);
    if (!Number.isInteger(options.shardIndex) || options.shardIndex < 0 || options.shardIndex >= shardCount) {
      throw new Error(`Nightly shard index must be between 0 and ${shardCount - 1}.`);
    }
    const known = new Set(all.map((entry) => entry.id));
    const unknownAnchors = [...anchors].filter((id) => !known.has(id));
    if (unknownAnchors.length) throw new Error(`Nightly anchors contain unknown ids: ${unknownAnchors.join(', ')}`);
    const rotating = all
      .filter((entry) => !anchors.has(entry.id))
      .sort((left, right) => stableRank(left.id) - stableRank(right.id));
    const selectedIds = new Set([
      ...anchors,
      ...rotating
        .filter((_, index) => index % shardCount === options.shardIndex)
        .map((entry) => entry.id),
    ]);
    return all.filter((entry) => selectedIds.has(entry.id));
  }
  const wanted = new Set(suite.caseIds ?? []);
  const selected = all.filter((entry) => wanted.has(entry.id));
  assertExactSelection(selected, wanted, `${options.tier} concern eval tier`);
  return selected;
}

export function selectConcernImagePairs(all, suites, options) {
  if (options.caseIds.length) {
    const wanted = new Set(options.caseIds);
    const selected = all.filter((entry) => wanted.has(entry.id) || wanted.has(entry.caseId));
    const represented = new Set(selected.flatMap((entry) => [entry.id, entry.caseId]));
    const missing = [...wanted].filter((id) => !represented.has(id));
    if (missing.length) throw new Error(`Explicit concern image selection contains unknown ids: ${missing.join(', ')}`);
    return selected;
  }
  const suite = suites.imageTiers?.[options.tier];
  if (!suite) throw new Error(`Unknown concern image eval tier: ${options.tier}`);
  if (options.tier === 'full') return all;
  if (options.tier === 'nightly') {
    const anchors = new Set(suite.anchorPairIds ?? []);
    const shardCount = Number(suite.shardCount);
    if (!Number.isInteger(options.shardIndex) || options.shardIndex < 0 || options.shardIndex >= shardCount) {
      throw new Error(`Nightly image shard index must be between 0 and ${shardCount - 1}.`);
    }
    const known = new Set(all.map((entry) => entry.id));
    const unknownAnchors = [...anchors].filter((id) => !known.has(id));
    if (unknownAnchors.length) throw new Error(`Nightly image anchors contain unknown ids: ${unknownAnchors.join(', ')}`);
    const rotating = all
      .filter((entry) => !anchors.has(entry.id))
      .sort((left, right) => stableRank(left.id) - stableRank(right.id));
    const selectedIds = new Set([
      ...anchors,
      ...rotating
        .filter((_, index) => index % shardCount === options.shardIndex)
        .map((entry) => entry.id),
    ]);
    return all.filter((entry) => selectedIds.has(entry.id));
  }
  const wanted = new Set(suite.pairIds ?? []);
  const selected = all.filter((entry) => wanted.has(entry.id));
  assertExactSelection(selected, wanted, `${options.tier} concern image eval tier`);
  return selected;
}

export function profileSeed(caseDefinition) {
  return {
    userId: `concern-eval-${caseDefinition.id}`,
    knownConditions: caseDefinition.profile.conditions,
    knownIngredientSensitivities: [],
    commonSymptoms: caseDefinition.profile.symptoms ?? [],
    symptomFrequency: 'It varies',
    symptomSeverityBaseline: 'It varies a lot',
    mealContexts: [],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
  };
}

function fixtureIngredient(fact, itemId) {
  return {
    rawName: fact.name,
    canonicalName: fact.name,
    confidence: fact.confidence ?? 'high',
    component: itemId,
    evidence: fact.evidence ?? 'visible',
    role: fact.role ?? 'main',
    prominence: fact.amount === 'trace' ? 'trace' : fact.amount === 'small' ? 'secondary' : 'primary',
    amountEstimate: fact.amount ?? 'standard',
    amountBasis: `${fact.amount ?? 'standard'} amount in the supplied eval fixture`,
  };
}

function fixtureMenuItem(id, fixture) {
  return {
    id,
    name: fixture.name,
    description: fixture.description,
    section: 'Transformation pair',
    extractedIngredients: fixture.facts
      .filter((fact) => (fact.evidence ?? 'visible') === 'visible')
      .map((fact) => fixtureIngredient(fact, id)),
    inferredIngredients: fixture.facts
      .filter((fact) => fact.evidence === 'inferred')
      .map((fact) => fixtureIngredient(fact, id)),
    prepStyle: fixture.prepStyle ?? [],
    conditionSeverities: [],
    dietFitHypotheses: [],
    confidence: fixture.clarity === 'unclear' ? 'low' : 'high',
    personalizedRiskScore: 0,
    personalizedRiskLevel: 'low',
  };
}

export function pairExtraction(caseDefinition) {
  return menuPair(
    caseDefinition.id,
    caseDefinition.description,
    fixtureMenuItem('base', caseDefinition.base),
    fixtureMenuItem('variant', caseDefinition.variant),
  );
}

function menuPair(title, summary, base, variant) {
  return {
    kind: 'menu',
    menuTitle: title,
    menuConfidence: 'high',
    inputPageCount: 0,
    items: [base, variant],
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary,
  };
}

export function combineIndependentConcernResults(baseResult, variantResult) {
  if (baseResult.status !== 'completed') return baseResult;
  if (variantResult.status !== 'completed') return variantResult;
  if (baseResult.subjects.length !== 1 || variantResult.subjects.length !== 1) {
    return {
      engineVersion: 'concern_v1',
      evidenceVersion: baseResult.evidenceVersion,
      status: 'failed',
      stage: 'finalization',
      code: 'concern_eval_expected_single_subject',
    };
  }
  return {
    ...baseResult,
    subjects: [
      { ...baseResult.subjects[0], subjectId: 'base' },
      { ...variantResult.subjects[0], subjectId: 'variant' },
    ],
  };
}

function condition(subject, key) {
  return subject?.conditions?.find((entry) => entry.conditionKey === key);
}

function allMechanisms(subject) {
  return new Set(subject?.conditions?.flatMap((entry) => entry.mechanisms ?? []) ?? []);
}

function confidenceRank(value) {
  return { low: 0, medium: 1, high: 2 }[value] ?? 99;
}

export function validateConcernPair(caseDefinition, shadowResult) {
  const failures = [];
  if (shadowResult.status !== 'completed') {
    return { passed: false, failures: [`shadow run failed at ${shadowResult.stage}: ${shadowResult.code}`] };
  }
  const base = shadowResult.subjects.find((subject) => subject.subjectId === 'base');
  const variant = shadowResult.subjects.find((subject) => subject.subjectId === 'variant');
  const baseCondition = condition(base, caseDefinition.expect.condition);
  const variantCondition = condition(variant, caseDefinition.expect.condition);
  if (!baseCondition || !variantCondition) {
    return { passed: false, failures: [`missing condition ${caseDefinition.expect.condition}`] };
  }
  const delta = variantCondition.score - baseCondition.score;
  const expected = caseDefinition.expect;
  if (expected.direction === 'down' && delta > -Number(expected.minDelta ?? 0)) failures.push(`expected decrease of at least ${expected.minDelta ?? 0}, got ${delta}`);
  if (expected.direction === 'up' && delta < Number(expected.minDelta ?? 0)) failures.push(`expected increase of at least ${expected.minDelta ?? 0}, got ${delta}`);
  if (expected.direction === 'same' && Math.abs(delta) > Number(expected.maxAbsDelta ?? 0)) failures.push(`expected |delta| <= ${expected.maxAbsDelta}, got ${delta}`);
  if (expected.direction === 'down_or_same' && delta > Number(expected.maxReverseDelta ?? 0)) failures.push(`expected no increase, got ${delta}`);

  for (const unaffected of expected.unaffected ?? []) {
    const before = condition(base, unaffected.condition);
    const after = condition(variant, unaffected.condition);
    if (!before || !after || Math.abs(after.score - before.score) > Number(unaffected.maxAbsDelta)) {
      failures.push(`unrelated condition ${unaffected.condition} moved too far`);
    }
  }

  const baseMechanisms = allMechanisms(base);
  const variantMechanisms = allMechanisms(variant);
  for (const mechanism of expected.removedMechanisms ?? []) {
    if (!baseMechanisms.has(mechanism) || variantMechanisms.has(mechanism)) failures.push(`mechanism ${mechanism} was not removed`);
  }
  for (const mechanism of expected.preservedMechanisms ?? []) {
    if (!baseMechanisms.has(mechanism) || !variantMechanisms.has(mechanism)) failures.push(`mechanism ${mechanism} was not preserved`);
  }
  for (const mechanism of expected.baseRequiredMechanisms ?? []) if (!baseMechanisms.has(mechanism)) failures.push(`base is missing ${mechanism}`);
  for (const mechanism of expected.variantRequiredMechanisms ?? []) if (!variantMechanisms.has(mechanism)) failures.push(`variant is missing ${mechanism}`);
  for (const mechanism of expected.baseForbiddenMechanisms ?? []) if (baseMechanisms.has(mechanism)) failures.push(`base incorrectly contains ${mechanism}`);
  for (const mechanism of expected.variantForbiddenMechanisms ?? []) if (variantMechanisms.has(mechanism)) failures.push(`variant incorrectly contains ${mechanism}`);
  if (expected.variantMaxConfidence && confidenceRank(variantCondition.confidence) > confidenceRank(expected.variantMaxConfidence)) {
    failures.push(`variant confidence ${variantCondition.confidence} exceeds ${expected.variantMaxConfidence}`);
  }
  return {
    passed: failures.length === 0,
    failures,
    actual: {
      baseScore: baseCondition.score,
      variantScore: variantCondition.score,
      delta,
      baseBand: baseCondition.band,
      variantBand: variantCondition.band,
      baseMechanisms: [...baseMechanisms],
      variantMechanisms: [...variantMechanisms],
    },
  };
}

function extractionText(meal) {
  return [
    meal.dishName,
    ...(meal.prepStyle ?? []),
    ...(meal.visibleIngredients ?? []).flatMap((entry) => [entry.rawName, entry.canonicalName]),
    ...(meal.inferredIngredients ?? []).flatMap((entry) => [entry.rawName, entry.canonicalName]),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function validateImageExtraction(pair, baseMeal, variantMeal) {
  const failures = [];
  for (const [label, fixture, meal] of [
    ['base', pair.base, baseMeal],
    ['variant', pair.variant, variantMeal],
  ]) {
    const text = extractionText(meal);
    for (const requirement of fixture.mustContain ?? []) {
      const alternatives = Array.isArray(requirement) ? requirement : [requirement];
      if (!alternatives.some((term) => text.includes(term.toLowerCase()))) {
        failures.push(`${label} extraction is missing ${alternatives.join(' or ')}`);
      }
    }
    for (const term of fixture.mustNotContain ?? []) {
      if (text.includes(term.toLowerCase())) failures.push(`${label} extraction unexpectedly contains ${term}`);
    }
  }
  return {
    passed: failures.length === 0,
    failures,
    actual: {
      baseDishName: baseMeal.dishName,
      variantDishName: variantMeal.dishName,
      baseIngredients: [...baseMeal.visibleIngredients, ...baseMeal.inferredIngredients].map((entry) => entry.canonicalName),
      variantIngredients: [...variantMeal.visibleIngredients, ...variantMeal.inferredIngredients].map((entry) => entry.canonicalName),
      basePrepStyle: baseMeal.prepStyle,
      variantPrepStyle: variantMeal.prepStyle,
    },
  };
}

export function summarizeConcernGate(results, minimumSoftPassRatio) {
  const hard = results.filter((result) => result.hard);
  const soft = results.filter((result) => !result.hard);
  const hardPassed = hard.filter((result) => result.validation.passed).length;
  const softPassed = soft.filter((result) => result.validation.passed).length;
  const operationalFailures = results.filter((result) => result.operationalFailure).length;
  return {
    total: results.length,
    hardPassed,
    hardTotal: hard.length,
    softPassed,
    softTotal: soft.length,
    minimumSoftPassRatio,
    operationalFailures,
    accepted: operationalFailures === 0
      && hardPassed === hard.length
      && (soft.length === 0 || softPassed / soft.length >= minimumSoftPassRatio),
  };
}

export function summarizeConcernAudits(audits, prefix = '') {
  return audits.map((audit) => ({
    stage: `${prefix}${audit.stage}`,
    status: audit.status,
    attemptCount: Number(audit.requestMetadata?.attemptCount ?? 1),
    validationIssues: audit.requestMetadata?.validationIssues ?? [],
    openaiResponseId: audit.openaiResponseId ?? null,
    totalTokens: audit.totalTokens ?? null,
    estimatedCostUsdMicros: audit.estimatedCostUsdMicros ?? null,
    hasRawResponse: audit.rawResponseJson != null,
  }));
}
