import type { IngredientConfidence } from './profile';
export declare const ingredientConditionImpacts: Record<string, Record<string, number>>;
export declare const symptomToCondition: Record<string, string[]>;
export type DeclaredSensitivityProfile = {
    aliases?: string[];
    ingredientAliases?: string[];
    prepStyles?: string[];
    noteKeywords?: string[];
    dishKeywords?: string[];
    conditionImpacts: Record<string, number>;
};
export declare const declaredSensitivityProfiles: Record<string, DeclaredSensitivityProfile>;
export type ScoringIngredient = {
    name: string;
    confidence: IngredientConfidence;
    evidence: 'visible' | 'inferred';
};
