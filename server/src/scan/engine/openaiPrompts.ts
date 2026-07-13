// Prompt builders for the OpenAI scan-engine stages: food (text/image/multi-
// image) extraction, scan-category classification, menu extraction, and risk
// adjudication. Band anchors and calibration examples live here too.

import { ExtractedIngredient } from './domain';
import { buildMenuRubricPromptText } from './menuRubric';
import { dietPromptText } from './dietRubric';
import { RISK_ADJUDICATION_PROMPT_VERSION, type RiskAdjudicationRequest } from './riskAdjudication';
import { MENU_LLM_BANDS, PROMPT_VERSION } from './openaiConfig';
import { MENU_ITEM_LIMIT } from './openaiSchemas';
import type { ExtractionContext } from './openaiTypes';

// Five one-line band anchors with concrete dishes so band choice is calibrated
// against fixed reference points instead of run-to-run vibes (Phase 2 item 1).
// Shared by food scans and menu items.
const BAND_ANCHOR_TEXT = [
  'Band anchors — calibrate every band against these:',
  '- none: no meaningful trigger for that condition is present (plain white rice; a banana; steamed vegetables).',
  '- mild: a single small or modest trigger in an otherwise gentle meal (rice-heavy sushi rolls with a splash of soy sauce; oatmeal with berries; grilled chicken with a buttered roll).',
  '- moderate: one clear trigger at normal portion, or two or three modest triggers stacking (creamy butter chicken for reflux; spaghetti in tomato sauce for reflux; a cheeseburger for IBS).',
  '- high: several strong triggers stacking in one dish, or one aggressive dominant trigger (pepperoni pizza for reflux or IBS; fried fish and chips for reflux; a milkshake for lactose intolerance).',
  '- severe: an extreme, unambiguous worst case for that condition (a loaded chili-cheese platter with fried sides and beer for reflux). Reserve severe for genuinely extreme loads.',
  'When nothing meaningful is present for a condition, use none, not mild.',
  'Trace- or condiment-level exposures (a dab of wasabi, a splash of soy sauce, a lemon wedge, a pickled garnish) never lift a band above mild on their own; moderate and above need at least one clear trigger at meaningful portion.',
  'Any band above none must cite at least one driver from the returned ingredients or prep.',
].join('\n');

const BAND_CALIBRATION_EXAMPLES = [
  'Worked examples:',
  '- Pepperoni pizza for GERD / acid reflux: band high, drivers ["pepperoni", "cheese", "tomato sauce"] — processed meat, fat, and acid stack in one dish.',
  '- Plain white rice for IBS: band none, drivers [] — no meaningful IBS trigger present.',
  '- Butter chicken with rice for GERD / acid reflux: band moderate, drivers ["butter", "cream sauce"] — rich and creamy, but the rice base is gentle and nothing fried or acidic stacks on top.',
].join('\n');

function conditionPromptText(
  knownConditions: string[] | undefined,
  options: { includeRationale?: boolean } = {},
) {
  const rationaleField = (options.includeRationale ?? true) ? ', and a one-line rationale' : '';
  const conditions = (knownConditions ?? []).map((condition) => condition.trim()).filter(Boolean);
  const instruction = conditions.length
    ? [
        `The person has these gut conditions: ${conditions.join(', ')}.`,
        `For EACH listed condition, add one conditionSeverities entry: condition (exactly as written above), band (none/mild/moderate/high/severe) for how risky THIS food is for THAT condition, drivers (the specific ingredients or prep that justify the band)${rationaleField}.`,
      ]
    : [
        `No diagnosed gut conditions are on file. Return a single conditionSeverities entry with condition "general" judging overall gut difficulty: band (none/mild/moderate/high/severe), drivers (the specific ingredients or prep that justify the band)${rationaleField}.`,
      ];
  return [
    ...instruction,
    'Cite drivers only from the ingredients and prep you returned above — do not introduce new or speculative ingredient names. If no returned ingredient or prep is a meaningful trigger for a condition, use band none with an empty drivers array.',
    BAND_ANCHOR_TEXT,
    BAND_CALIBRATION_EXAMPLES,
  ].join('\n');
}

// Declared sensitivities enter the extraction context as a verification list,
// never as a suggestion list (Phase 2 item 5).
function knownIngredientsPromptLine(context: ExtractionContext) {
  const known = (context.knownIngredients ?? []).map((entry) => entry.trim()).filter(Boolean);
  if (!known.length) {
    return null;
  }
  return `The user reports sensitivities to: ${known.slice(0, 12).join(', ')}. Check carefully for these, but report one only if it is actually present in this meal — never add a sensitivity ingredient that is not there.`;
}

const FOOD_BANDS_ON_SYSTEM_LINE =
  'Also provide a conditionSeverities array: one per-condition severity band as instructed in the user prompt.';
const FOOD_BANDS_OFF_SYSTEM_LINE = 'Return conditionSeverities as an empty array.';
const FOOD_BANDS_OFF_USER_LINE = 'Return an empty conditionSeverities array.';

function foodBandsSystemLine(includeBands: boolean) {
  return includeBands ? FOOD_BANDS_ON_SYSTEM_LINE : FOOD_BANDS_OFF_SYSTEM_LINE;
}

function foodBandsUserLine(includeBands: boolean, knownConditions: string[]) {
  return includeBands ? conditionPromptText(knownConditions) : FOOD_BANDS_OFF_USER_LINE;
}

// Existence rule shared by the image and text extraction system prompts: the
// old wording listed "trace" among hedged words, colliding with the legitimate
// amountEstimate value for tiny-but-present amounts (Phase 2 item 5).
const HEDGED_EXISTENCE_RULE =
  'Never report an ingredient, and never emit a riskModifier, from hedged existence language such as "possible", "might contain", "could have", or "sometimes added" — either it is present or it is not. A tiny amount that is definitely present is not hedged: report it with amountEstimate trace.';

const INGREDIENT_FIELDS_RULE =
  'For each ingredient set role, prominence, amountEstimate, and a short amountBasis exactly as defined in the response schema field descriptions.';

export function buildImageSystemPrompt(includeBands: boolean) {
  return `You are ${PROMPT_VERSION}. Analyze a single meal photo for food recognition only. Return only JSON matching the provided schema. Identify the most likely dish, components, visible ingredients, inferred ingredients, sauces, dressings, and preparation methods. Use canonical ingredient names in singular lowercase when possible. Ingredient canonicalName values must be actual food or ingredient names, never rubric category keys such as spicy_heat, dairy_based, lean_meat_poultry, or wheat_grain_based; put those classifications only in baseFoodCategory or riskModifiers. Separate visible ingredients from inferred ingredients. ${INGREDIENT_FIELDS_RULE} Ground everything in what is actually there: report only ingredients you can see or that are defining, standard components of the identified dish (e.g. rice, rice vinegar, and nori for sushi). ${HEDGED_EXISTENCE_RULE} If a dish does not contain something by definition (e.g. plain vegetable sushi has no garlic or onion), do not list it. For whole foods and simple single-ingredient dishes, return the minimal ingredient set and an empty riskModifiers array unless a risk is unmistakably present. Also classify the meal into exactly one baseFoodCategory and 0-10 riskModifiers from the controlled rubric below. If diet goals are provided, include dietFitHypotheses as food-fact hypotheses only. If no diet goals are provided, return dietFitHypotheses as an empty array. If the meal is too obscured, cropped, blurry, or mixed to produce a useful ingredient list, set clarity to unclear and explain briefly. ${foodBandsSystemLine(includeBands)} Do not provide medical advice or a final numeric risk score.

${buildMenuRubricPromptText()}`;
}

export function buildImageUserPrompt(context: ExtractionContext, includeBands: boolean) {
  return [
    'Analyze this single meal photo for structured food recognition.',
    'Represent multi-item plates in the components array.',
    'Each result must include exactly one baseFoodCategory and a riskModifiers array, even when empty.',
    knownIngredientsPromptLine(context),
    foodBandsUserLine(includeBands, context.knownConditions),
    dietPromptText(context.dietPreferences ?? []),
    'Return JSON matching the response schema.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildMultiImageUserPrompt(context: ExtractionContext & { imageCount: number }, includeBands: boolean) {
  return [
    `Analyze these ${context.imageCount} food images as one scan.`,
    'They may show multiple angles, a receipt-like food list, or multiple items from the same meal. Combine them into one structured food recognition result.',
    'Represent multi-item meals in the components array.',
    'Each result must include exactly one baseFoodCategory and a riskModifiers array, even when empty.',
    knownIngredientsPromptLine(context),
    foodBandsUserLine(includeBands, context.knownConditions),
    dietPromptText(context.dietPreferences ?? []),
    'Return JSON matching the response schema.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildScanClassificationSystemPrompt() {
  return `You classify scan images for routing only. Return only JSON matching the provided schema. Choose category "menu" only when the image(s) primarily show a restaurant menu, menu screenshot, catering menu, or food item list with multiple orderable items. Choose category "food" for plated food, packaged products, grocery labels, receipts without menu items, or anything that should be analyzed as a meal/product rather than a restaurant menu.`;
}

export function buildScanClassificationUserPrompt(imageCount: number) {
  return [
    `Classify these ${imageCount} scan image(s) as food or menu.`,
    'If multiple images are provided and any image is clearly a menu page, choose menu.',
    'Return JSON matching the response schema.',
  ].join('\n');
}

export function buildMenuSystemPrompt() {
  return `You are ${PROMPT_VERSION}_menu. Extract restaurant menu items from menu photos/screenshots. Return only JSON matching the provided schema. First decide if the images are actually a restaurant menu, menu screenshot, catering menu, or food item list. If not, set isMenu false, include a short notMenuReason, and return an empty items array. Extract at most ${MENU_ITEM_LIMIT} visible food or drink items total across all pages.

Completeness is more important than beautiful descriptions. Treat the task like OCR plus menu parsing:
- Scan every column, row, section, and continuation area from top-left to bottom-right on each page.
- Include every visible food or drink item, including simple sushi/sashimi lines, drinks, sides, add-ons, and items with no description.
- Do not skip an item just because it lacks price, description, photo, or ingredients.
- Do not collapse neighboring rows into one item unless the menu clearly shows they are the same item.
- Preserve section names, item names, compact descriptions, and prices when visible.
- Keep descriptions to 10 words or fewer. If the printed description is long, compress it to the decisive ingredients/prep only.
- Include ingredientCallouts as 0-3 short ingredient names from visible text or strong common dish knowledge.
- Include prepStyle cues such as raw, grilled, broiled, steamed, fried, tempura, creamy, spicy, sauced, or pickled.
- Keep per-item arrays concise: at most 3 ingredientCallouts, 4 prepStyle cues, and the 5 strongest riskModifiers.
- Keep baseFoodCategory.source and riskModifiers.source to the shortest exact menu words or common cue, not a sentence.
- You must return complete valid JSON. If output budget is tight, shorten descriptions and sources first; never end mid-object or mid-array.
- If diet goals are provided, include one dietFitHypotheses entry per selected diet for each item. These are hypotheses only; do not make guaranteed allergy/celiac safety claims. If no diet goals are provided, return an empty dietFitHypotheses array for every item.
${MENU_LLM_BANDS ? '- For each item, also include a conditionSeverities array as instructed in the user prompt (one per-condition severity band). Judge realistically; an ordinary item is usually none or mild.' : '- Return an empty conditionSeverities array for every item.'}

${buildMenuRubricPromptText()}

Do not output a final numeric risk score or make guaranteed safety claims.`;
}

export function buildMenuUserPrompt(context: ExtractionContext & { pageCount: number }) {
  return [
    `Analyze these ${context.pageCount} menu image(s) as one complete menu.`,
    `Extract no more than ${MENU_ITEM_LIMIT} items.`,
    'Each item must include exactly one baseFoodCategory and a riskModifiers array, even when the array is empty.',
    knownIngredientsPromptLine(context),
    MENU_LLM_BANDS
      ? `Apply this per item: ${conditionPromptText(context.knownConditions, { includeRationale: false })}`
      : 'Return an empty conditionSeverities array for every item.',
    dietPromptText(context.dietPreferences ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTextSystemPrompt(includeBands: boolean) {
  return `You are ${PROMPT_VERSION}. Analyze a meal description for food recognition only. Return only JSON matching the provided schema. Use canonical ingredient names in singular lowercase when possible. Ingredient canonicalName values must be actual food or ingredient names, never rubric category keys such as spicy_heat, dairy_based, lean_meat_poultry, or wheat_grain_based; put those classifications only in baseFoodCategory or riskModifiers. Separate explicit ingredients from inferred ingredients conservatively. ${INGREDIENT_FIELDS_RULE} Ground everything in what the description actually states or what is a defining, standard component of the named dish. ${HEDGED_EXISTENCE_RULE} For whole foods and simple single-ingredient dishes, return the minimal ingredient set and an empty riskModifiers array unless a risk is unmistakably present. Classify the meal into exactly one baseFoodCategory and 0-10 riskModifiers from the controlled rubric below. If diet goals are provided, include dietFitHypotheses as food-fact hypotheses only. If no diet goals are provided, return dietFitHypotheses as an empty array. For text descriptions, set clarity to clear when the user provides a recognizable meal, menu item, or ingredient list, even if some ingredient placement is ambiguous; capture that ambiguity in notes instead. Set clarity to unclear only when the text is not a food/meal description or lacks enough usable food detail. ${foodBandsSystemLine(includeBands)} Do not provide medical advice or a final numeric risk score.

${buildMenuRubricPromptText()}`;
}

export function buildTextUserPrompt(text: string, context: ExtractionContext, includeBands: boolean) {
  // The meal description leads: everything after it is standing instruction,
  // so the subject of the analysis is never buried under boilerplate.
  return [
    `Meal description: ${text}`,
    'Analyze this meal description for structured food recognition.',
    'Represent multi-item meals in the components array when needed.',
    knownIngredientsPromptLine(context),
    foodBandsUserLine(includeBands, context.knownConditions),
    dietPromptText(context.dietPreferences ?? []),
    'Return JSON matching the response schema.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildRiskAdjudicationSystemPrompt() {
  return [
    `You are ${RISK_ADJUDICATION_PROMPT_VERSION}.`,
    'You adjudicate digestive risk severity bands for a single already-extracted food scan.',
    'Use only the extracted food facts, user conditions, personal learned evidence, and cited RAG evidence supplied in the user message.',
    'Return only JSON matching the provided schema.',
    'Do not output a numeric score.',
    'Do not invent ingredients, conditions, citations, diagnoses, or medical advice.',
    'genericBand is the condition risk from food facts plus cited general nutrition evidence; treat the supplied extractionConditionSeverities as the prior for genericBand and depart from it only when the food facts or cited evidence clearly justify it.',
    'personalizedBand is the condition risk after considering the user-specific learned calm/reactive evidence.',
    'finalBand is the band the deterministic scorer will use. Set finalBand = personalizedBand only when the cited personal evidence is medium or high confidence; otherwise set finalBand = genericBand.',
    'Use citationChunkIds only from the short supplied RAG evidence IDs such as cite-0.',
  ].join(' ');
}

function adjudicationIngredientFacts(ingredient: ExtractedIngredient) {
  return {
    rawName: ingredient.rawName,
    canonicalName: ingredient.canonicalName,
    role: ingredient.role,
    prominence: ingredient.prominence,
    // Dose matters: the adjudicator must see how much of the trigger is there,
    // not just that it exists (Phase 2 item 4).
    amountEstimate: ingredient.amountEstimate,
    confidence: ingredient.confidence,
  };
}

export function buildRiskAdjudicationUserPrompt(input: RiskAdjudicationRequest) {
  const foodFacts = {
    dishName: input.structuredAnalysis.dishName,
    dishConfidence: input.structuredAnalysis.dishConfidence,
    visibleIngredients: input.structuredAnalysis.visibleIngredients.map(adjudicationIngredientFacts),
    inferredIngredients: input.structuredAnalysis.inferredIngredients.map(adjudicationIngredientFacts),
    prepStyle: input.structuredAnalysis.prepStyle,
    baseFoodCategory: input.structuredAnalysis.baseFoodCategory,
    riskModifiers: input.structuredAnalysis.riskModifiers,
  };
  const extractionConditionSeverities = (input.structuredAnalysis.conditionSeverities ?? []).map((entry) => ({
    condition: entry.condition,
    band: entry.band,
    drivers: entry.drivers,
  }));
  const ragEvidence = input.ragEvidence.slice(0, 5).map((chunk, index) => ({
    chunkId: `cite-${index}`,
    title: chunk.title,
    source: chunk.source,
    url: chunk.url,
    conditionTags: chunk.conditionTags,
    ingredientTags: chunk.ingredientTags,
    direction: chunk.direction,
    relevanceScore: chunk.relevanceScore,
    content: chunk.content.replace(/\s+/g, ' ').slice(0, 900),
  }));

  return [
    'Adjudicate digestive condition severity bands for this food scan.',
    'Return one conditionSeverities entry for every condition in userContext.knownConditions.',
    'Drivers must be extracted ingredients or preparation facts from extractedFoodFacts.',
    'extractionConditionSeverities are the vision extractor\'s bands: use them as the genericBand prior.',
    'protectiveEvidence and personalEvidenceUsed should summarize only supplied personal evidence.',
    'If RAG evidence is relevant, cite it by chunkId. If it is not relevant, leave citationChunkIds empty.',
    'Input JSON:',
    JSON.stringify({
      extractedFoodFacts: foodFacts,
      extractionConditionSeverities,
      userContext: { knownConditions: input.knownConditions },
      personalEvidence: input.personalEvidence,
      ragEvidence,
    }),
    'Return JSON matching the response schema.',
  ].join('\n');
}
