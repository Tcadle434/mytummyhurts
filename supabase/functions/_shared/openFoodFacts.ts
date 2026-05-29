import { ApiError } from './http.ts';
import { IngredientConfidence } from './domain.ts';

export type GroceryProductLookup = {
  barcode: string;
  brand?: string;
  name: string;
  ingredientText: string;
  nutrition: Record<string, unknown>;
  allergens: string[];
  dataSource: 'open_food_facts';
  sourceConfidence: IngredientConfidence;
};

const OPEN_FOOD_FACTS_BASE_URL =
  Deno.env.get('OPEN_FOOD_FACTS_BASE_URL') ?? 'https://world.openfoodfacts.org/api/v2';
const OPEN_FOOD_FACTS_USER_AGENT =
  Deno.env.get('OPEN_FOOD_FACTS_USER_AGENT') ??
  'MyTummyHurts/1.0 (https://mytummyhurts.app)';

const PRODUCT_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'generic_name',
  'generic_name_en',
  'brands',
  'ingredients_text',
  'ingredients_text_en',
  'nutriments',
  'allergens_tags',
].join(',');

export function normalizeBarcode(value: string | undefined) {
  const normalized = value?.replace(/[^\d]/g, '') ?? '';
  if (!normalized || normalized.length < 6 || normalized.length > 18) {
    throw new ApiError('Scan a valid product barcode.', 400, 'invalid_barcode');
  }
  return normalized;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function productFromOpenFoodFactsPayload(
  barcode: string,
  payload: unknown,
): GroceryProductLookup {
  const body = recordValue(payload);
  if (Number(body.status ?? 0) !== 1) {
    throw new ApiError('We could not find that barcode yet.', 404, 'barcode_not_found', {
      barcode,
    });
  }

  const product = recordValue(body.product);
  const name =
    stringValue(product.product_name_en) ||
    stringValue(product.product_name) ||
    stringValue(product.generic_name_en) ||
    stringValue(product.generic_name);
  const ingredientText =
    stringValue(product.ingredients_text_en) ||
    stringValue(product.ingredients_text);

  if (!name) {
    throw new ApiError('That product is missing a usable name.', 422, 'barcode_product_missing_name', {
      barcode,
    });
  }

  if (!ingredientText) {
    throw new ApiError('That product is missing ingredient details.', 422, 'barcode_product_missing_ingredients', {
      barcode,
      productName: name,
    });
  }

  return {
    barcode,
    brand: stringValue(product.brands) || undefined,
    name,
    ingredientText,
    nutrition: recordValue(product.nutriments),
    allergens: stringArray(product.allergens_tags),
    dataSource: 'open_food_facts',
    sourceConfidence: 'medium',
  };
}

export async function fetchOpenFoodFactsProduct(barcodeValue: string) {
  const barcode = normalizeBarcode(barcodeValue);
  const url = `${OPEN_FOOD_FACTS_BASE_URL}/product/${barcode}.json?fields=${encodeURIComponent(PRODUCT_FIELDS)}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
      },
    });
  } catch (error) {
    throw new ApiError('Product lookup is temporarily unavailable.', 503, 'barcode_lookup_unavailable', {
      barcode,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (response.status === 404) {
    throw new ApiError('We could not find that barcode yet.', 404, 'barcode_not_found', {
      barcode,
    });
  }

  if (response.status === 429) {
    throw new ApiError('Barcode lookup is busy. Try again in a moment.', 429, 'barcode_lookup_rate_limited', {
      barcode,
    });
  }

  if (!response.ok) {
    throw new ApiError('Product lookup failed.', 502, 'barcode_lookup_failed', {
      barcode,
      status: response.status,
    });
  }

  return productFromOpenFoodFactsPayload(barcode, await response.json());
}
