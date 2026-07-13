import { createHash } from 'node:crypto';

export const EVAL_TIERS = ['smoke', 'release', 'nightly', 'full'];

function unique(values) {
  return [...new Set(values)];
}

function hashValue(value) {
  return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);
}

function enabledCases(cases) {
  return cases.filter((entry) => entry.enabled !== false);
}

function assertKnownIds(ids, knownIds, label) {
  const missing = ids.filter((id) => !knownIds.has(id));
  if (missing.length) {
    throw new Error(`${label} references unknown case id(s): ${missing.join(', ')}`);
  }
}

export function validateSuiteConfig(cases, suitesDoc) {
  const active = enabledCases(cases);
  const knownIds = new Set(active.map((entry) => entry.id));
  if (knownIds.size !== active.length) throw new Error('scan eval case ids must be unique');
  if (!suitesDoc?.tiers) throw new Error('scan eval suite config must define tiers');

  for (const tier of EVAL_TIERS.filter((entry) => entry !== 'full')) {
    const config = suitesDoc.tiers[tier];
    if (!config) throw new Error(`scan eval suite config is missing tier "${tier}"`);
    const fixed = unique([...(config.caseIds ?? []), ...(config.anchorCaseIds ?? [])]);
    assertKnownIds(fixed, knownIds, `tier "${tier}"`);
    if (fixed.length !== (config.caseIds ?? []).length + (config.anchorCaseIds ?? []).length) {
      throw new Error(`tier "${tier}" contains duplicate case ids`);
    }
  }

  const smoke = new Set(suitesDoc.tiers.smoke.caseIds ?? []);
  const release = new Set(suitesDoc.tiers.release.caseIds ?? []);
  const notInRelease = [...smoke].filter((id) => !release.has(id));
  if (notInRelease.length) {
    throw new Error(`smoke cases must be release anchors: ${notInRelease.join(', ')}`);
  }

  const shardCount = Number(suitesDoc.tiers.nightly.shardCount);
  if (!Number.isInteger(shardCount) || shardCount < 2) {
    throw new Error('nightly shardCount must be an integer greater than one');
  }
  return true;
}

function selectConfigured(cases, ids) {
  const wanted = new Set(ids);
  return cases.filter((entry) => wanted.has(entry.id));
}

function releaseCases(cases, config, seed) {
  const fixedIds = unique(config.caseIds ?? []);
  const fixed = selectConfigured(cases, fixedIds);
  const fixedSet = new Set(fixedIds);
  const rotatingCount = Number(config.rotatingCount ?? 0);
  const rotating = cases
    .filter((entry) => !fixedSet.has(entry.id) && entry.releaseEligible !== false)
    .map((entry) => ({ entry, rank: hashValue(`${seed}:${entry.id}`) }))
    .sort((a, b) => a.rank - b.rank || a.entry.id.localeCompare(b.entry.id))
    .slice(0, rotatingCount)
    .map(({ entry }) => entry);
  return [...fixed, ...rotating];
}

function nightlyCases(cases, config, shardIndex) {
  const shardCount = Number(config.shardCount);
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) {
    throw new Error(`nightly shard index must be between 0 and ${shardCount - 1}`);
  }
  const anchors = unique(config.anchorCaseIds ?? []);
  const anchorSet = new Set(anchors);
  const anchorCases = selectConfigured(cases, anchors);
  const rotating = cases
    .filter((entry) => !anchorSet.has(entry.id) && entry.nightlyEligible !== false)
    .map((entry) => ({ entry, rank: hashValue(entry.id) }))
    .sort((a, b) => a.rank - b.rank || a.entry.id.localeCompare(b.entry.id))
    .filter((_, index) => index % shardCount === shardIndex)
    .map(({ entry }) => entry);
  const selectedIds = new Set([...anchorCases, ...rotating].map((entry) => entry.id));
  const selected = cases.filter((entry) => selectedIds.has(entry.id));
  return { selected, shardCount };
}

export function selectEvalCases(cases, suitesDoc, options = {}) {
  validateSuiteConfig(cases, suitesDoc);
  const active = enabledCases(cases);
  const knownIds = new Set(active.map((entry) => entry.id));

  if (options.caseIds?.length) {
    const ids = unique(options.caseIds);
    assertKnownIds(ids, knownIds, 'explicit selection');
    return {
      cases: selectConfigured(active, ids),
      metadata: {
        tier: 'custom',
        caseIds: ids,
        caseCount: ids.length,
        isFull: ids.length === active.length,
      },
    };
  }

  const tier = options.tier ?? 'full';
  if (!EVAL_TIERS.includes(tier)) {
    throw new Error(`--tier must be one of: ${EVAL_TIERS.join(', ')}`);
  }

  let selected = active;
  const metadata = { tier, shardIndex: null, shardCount: null, rotationSeed: null };
  if (tier === 'smoke') {
    selected = selectConfigured(active, suitesDoc.tiers.smoke.caseIds ?? []);
  } else if (tier === 'release') {
    const seed = String(options.seed ?? 'local');
    selected = releaseCases(active, suitesDoc.tiers.release, seed);
    metadata.rotationSeed = seed;
  } else if (tier === 'nightly') {
    const shardIndex = Number(options.shardIndex ?? 0);
    const nightly = nightlyCases(active, suitesDoc.tiers.nightly, shardIndex);
    selected = nightly.selected;
    metadata.shardIndex = shardIndex;
    metadata.shardCount = nightly.shardCount;
  }

  const maxCases = Number(suitesDoc.tiers[tier]?.maxCases ?? active.length);
  if (selected.length > maxCases) {
    throw new Error(`tier "${tier}" selected ${selected.length} cases, exceeding its ${maxCases}-case budget`);
  }

  return {
    cases: selected,
    metadata: {
      ...metadata,
      caseIds: selected.map((entry) => entry.id),
      caseCount: selected.length,
      totalEnabledCases: active.length,
      isFull: selected.length === active.length,
    },
  };
}
