export interface ModelConditionTarget {
  key: string;
  label: string;
}

function normalizedCondition(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function modelConditionKey(value: string) {
  const normalized = normalizedCondition(value);
  if (!normalized) return '';
  if (normalized === 'general') return 'general';
  if (normalized === 'ibs' || normalized.includes('irritable bowel')) return 'ibs';
  if (
    normalized === 'gerd'
    || normalized.includes('acid reflux')
    || normalized.includes('reflux heartburn')
  ) {
    return 'gerd';
  }
  if (normalized.includes('lactose')) return 'lactose_intolerance';
  if (normalized.includes('gluten') || normalized.includes('wheat sensitivity')) {
    return 'gluten_sensitivity';
  }
  if (
    normalized.includes('general discomfort')
    || normalized.includes('sensitive stomach')
    || normalized.includes('not sure')
    || normalized.includes('unsure')
  ) {
    return 'general_discomfort';
  }
  return normalized.replace(/\s+/gu, '_');
}

export function buildModelConditionTargets(conditions: readonly string[]): ModelConditionTarget[] {
  const targets = new Map<string, ModelConditionTarget>();
  for (const value of conditions) {
    const label = value.trim().normalize('NFKC').replace(/\s+/gu, ' ');
    const key = modelConditionKey(label);
    if (key && !targets.has(key)) targets.set(key, { key, label });
  }
  return targets.size ? [...targets.values()] : [{ key: 'general', label: 'general' }];
}
