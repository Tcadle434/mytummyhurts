import { menuBaseFoodCategoryRubric } from './menuBaseFoodCategoryRubric';
import type { MenuRubricRule } from './menuRubricClassification';
import { menuRiskModifierRubric } from './menuRiskModifierRubric';

export { menuBaseFoodCategoryRubric } from './menuBaseFoodCategoryRubric';
export {
  isMenuRubricClassificationKey,
  menuBaseFoodCategoryKeys,
  menuRiskModifierKeys,
  menuRubricEvidenceValues,
} from './menuRubricClassification';
export type {
  MenuBaseFoodCategory,
  MenuBaseFoodCategoryKey,
  MenuRiskModifier,
  MenuRiskModifierKey,
  MenuRubricEvidence,
  MenuRubricRule,
} from './menuRubricClassification';
export { menuRiskModifierRubric } from './menuRiskModifierRubric';

export const FOOD_RISK_RUBRIC_SCHEMA_VERSION = 'food_risk_rubric_v2';
export const MENU_FOOD_RUBRIC_SCHEMA_VERSION = FOOD_RISK_RUBRIC_SCHEMA_VERSION;

// Each rule ships its full boundary definition (`prompt`), not just its label:
// pre-Phase-2 the definitions (incl. per-rule carve-outs like the mayo-is-not-
// lactose rule) were written but never delivered to the model.
function promptList(definitions: readonly MenuRubricRule[]) {
  return definitions.map((definition) => `- ${definition.key} (${definition.label}): ${definition.prompt}`).join('\n');
}

export function buildMenuRubricPromptText() {
  return [
    `Rubric schema: ${MENU_FOOD_RUBRIC_SCHEMA_VERSION}.`,
    'For every menu item, choose exactly one baseFoodCategory from this rubric. Choose the dominant food family; use mixed_dish_or_entree only when no single food family dominates, and unknown only when the item is too ambiguous.',
    promptList(menuBaseFoodCategoryRubric),
    'Then assign 0-10 riskModifiers from this rubric. Include risk drivers and gentler/protective cues; these are not scores. Apply each definition exactly, including its carve-outs. Use common dish knowledge when the item name clearly implies a modifier, but lower confidence when uncertain.',
    promptList(menuRiskModifierRubric),
  ].join('\n');
}
