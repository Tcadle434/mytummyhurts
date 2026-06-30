// Shared scoring data tables and small scoring types. Extracted verbatim
// (byte-identical in both engines) from src/services/ai/scoring.ts (Expo) and
// server/src/scan/engine/scoring.ts (NestJS). Both scoring.ts files import these
// so behavior is unchanged.
import type { IngredientConfidence } from './profile';

export const ingredientConditionImpacts: Record<string, Record<string, number>> = {
  tomato: { 'GERD / reflux': 24, IBS: 8 },
  garlic: { IBS: 20, 'High FODMAP sensitivity': 22 },
  onion: { IBS: 18, 'High FODMAP sensitivity': 22 },
  dairy: { 'Lactose intolerance': 26, IBS: 10 },
  cheese: { 'Lactose intolerance': 24, 'GERD / reflux': 10 },
  yogurt: { 'Lactose intolerance': 18, IBS: 8 },
  bun: { 'Gluten sensitivity': 20, Celiac: 30 },
  pasta: { 'Gluten sensitivity': 18, Celiac: 30 },
  fries: { 'GERD / reflux': 16, IBS: 8 },
  'hot sauce': { 'GERD / reflux': 24, IBS: 10 },
  avocado: { IBS: 8 },
  beans: { IBS: 18, 'High FODMAP sensitivity': 18 },
  rice: { IBS: -8, 'Sensitive stomach': -8 },
  salmon: { 'Sensitive stomach': -10 },
  chicken: { 'Sensitive stomach': -8 },
  cucumber: { 'Sensitive stomach': -6 },
  berries: { 'Sensitive stomach': -4 },
};

export const symptomToCondition: Record<string, string[]> = {
  'reflux / heartburn': ['GERD / reflux'],
  bloating: ['IBS', 'High FODMAP sensitivity'],
  'stomach pain': ['IBS', 'Sensitive stomach'],
  nausea: ['Sensitive stomach'],
  urgency: ['IBS'],
  diarrhea: ['IBS'],
  constipation: ['IBS'],
  fatigue: ['Sensitive stomach'],
  'brain fog': ['Sensitive stomach'],
  other: ['Sensitive stomach'],
};

export type DeclaredSensitivityProfile = {
  aliases?: string[];
  ingredientAliases?: string[];
  prepStyles?: string[];
  noteKeywords?: string[];
  dishKeywords?: string[];
  conditionImpacts: Record<string, number>;
};

export const declaredSensitivityProfiles: Record<string, DeclaredSensitivityProfile> = {
  dairy: {
    aliases: ['lactose', 'milk'],
    ingredientAliases: ['dairy', 'milk', 'cheese', 'yogurt', 'parmesan', 'cream', 'butter', 'whey', 'casein'],
    prepStyles: ['creamy'],
    noteKeywords: ['dairy'],
    conditionImpacts: { 'Lactose intolerance': 20, IBS: 8, 'Sensitive stomach': 6 },
  },
  tomato: {
    ingredientAliases: ['tomato', 'marinara', 'salsa', 'pizza sauce', 'ketchup'],
    noteKeywords: ['tomato'],
    conditionImpacts: { 'GERD / reflux': 16, IBS: 6, 'Histamine sensitivity': 14 },
  },
  garlic: {
    ingredientAliases: ['garlic', 'garlic powder', 'garlic sauce', 'garlic oil'],
    conditionImpacts: { IBS: 20, 'High FODMAP sensitivity': 20, 'Sensitive stomach': 6 },
  },
  onion: {
    ingredientAliases: ['onion', 'pickled onion', 'shallot', 'scallion', 'green onion'],
    conditionImpacts: { IBS: 18, 'High FODMAP sensitivity': 20, 'Sensitive stomach': 6 },
  },
  gluten: {
    ingredientAliases: ['gluten', 'pasta', 'bun', 'bread', 'flour', 'noodle', 'breadcrumbs', 'cracker', 'granola'],
    noteKeywords: ['breaded'],
    conditionImpacts: { 'Gluten sensitivity': 20, Celiac: 30, IBS: 8 },
  },
  beans: {
    ingredientAliases: ['beans', 'bean', 'lentil', 'chickpea', 'black bean', 'kidney bean'],
    conditionImpacts: { IBS: 16, 'High FODMAP sensitivity': 18 },
  },
  'spicy foods': {
    aliases: ['spicy'],
    ingredientAliases: ['hot sauce', 'jalapeno', 'chili', 'chilli', 'sriracha', 'buffalo sauce', 'pepper flakes', 'curry'],
    prepStyles: ['spicy'],
    noteKeywords: ['spicy'],
    conditionImpacts: { 'GERD / reflux': 18, IBS: 10, 'Sensitive stomach': 8, 'Histamine sensitivity': 8 },
  },
  'fried foods': {
    aliases: ['fried'],
    ingredientAliases: ['fries', 'tempura', 'fried chicken', 'fried fish', 'onion rings'],
    prepStyles: ['fried', 'crispy', 'breaded'],
    noteKeywords: ['fried'],
    conditionImpacts: { 'GERD / reflux': 14, IBS: 8, 'Sensitive stomach': 10 },
  },
  'high-fat foods': {
    aliases: ['high fat foods', 'fatty foods'],
    ingredientAliases: ['cheese', 'cream', 'butter', 'bacon', 'sausage', 'burger', 'fries', 'mayo', 'aioli'],
    prepStyles: ['fried', 'creamy'],
    noteKeywords: ['higher fat meal'],
    conditionImpacts: { 'GERD / reflux': 14, IBS: 6, 'Sensitive stomach': 8 },
  },
  'artificial sweeteners': {
    aliases: ['sweeteners', 'artificial sweetener'],
    ingredientAliases: ['aspartame', 'sucralose', 'saccharin', 'erythritol', 'xylitol', 'sorbitol', 'diet soda', 'sweetener'],
    noteKeywords: ['sugar-free'],
    conditionImpacts: { IBS: 18, 'Sensitive stomach': 10 },
  },
};

export type ScoringIngredient = {
  name: string;
  confidence: IngredientConfidence;
  evidence: 'visible' | 'inferred';
};
