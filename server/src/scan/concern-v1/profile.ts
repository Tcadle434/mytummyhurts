import type { UserProfile } from '../engine/domain';
import type { ConcernConditionContext, SupportedConditionKey } from './domain';

const LABELS: Record<SupportedConditionKey, string> = {
  ibs: 'IBS',
  gerd: 'GERD / Acid reflux',
  lactose_intolerance: 'Lactose intolerance',
  gluten_sensitivity: 'Gluten sensitivity',
  general_discomfort: 'General gut sensitivity',
};

function normalize(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function conditionKey(value: string): SupportedConditionKey | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  const tokens = new Set(normalized.split(' '));
  if (tokens.has('ibs') || normalized.includes('irritable bowel')) return 'ibs';
  if (tokens.has('gerd') || normalized.includes('acid reflux') || normalized.includes('heartburn')) {
    return 'gerd';
  }
  if (normalized.includes('lactose')) return 'lactose_intolerance';
  if (normalized.includes('gluten') || normalized.includes('wheat sensitivity')) return 'gluten_sensitivity';
  if (
    normalized.includes('general discomfort')
    || normalized.includes('sensitive stomach')
    || normalized.includes('not sure')
    || normalized.includes('unsure')
  ) {
    return 'general_discomfort';
  }
  return null;
}

export function resolveConcernConditions(profile: UserProfile | null): ConcernConditionContext[] {
  const symptoms = (profile?.commonSymptoms ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 12);
  const byKey = new Map<SupportedConditionKey, string>();
  for (const condition of profile?.knownConditions ?? []) {
    const key = conditionKey(condition);
    if (key && !byKey.has(key)) byKey.set(key, condition.trim());
  }

  const named = [...byKey.entries()].filter(([key]) => key !== 'general_discomfort');
  const selected = named.length
    ? named
    : byKey.has('general_discomfort')
      ? ([['general_discomfort', byKey.get('general_discomfort')!]] as Array<[SupportedConditionKey, string]>)
      : ([['general_discomfort', 'General discomfort']] as Array<[SupportedConditionKey, string]>);

  return selected.map(([key, profileValue]) => ({
    key,
    label: LABELS[key],
    profileValue,
    symptomContext: symptoms,
  }));
}

export function concernConditionLabel(key: SupportedConditionKey) {
  return LABELS[key];
}
