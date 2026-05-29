import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { normalizeBarcode, productFromOpenFoodFactsPayload } from './openFoodFacts.ts';
import { ApiError } from './http.ts';

Deno.test('normalizeBarcode strips non-digits', () => {
  assertEquals(normalizeBarcode(' 01234-5678905 '), '012345678905');
});

Deno.test('productFromOpenFoodFactsPayload maps product fields', () => {
  const product = productFromOpenFoodFactsPayload('012345678905', {
    status: 1,
    product: {
      product_name: 'Penne Pasta',
      brands: 'Test Brand',
      ingredients_text: 'Durum wheat semolina, water.',
      nutriments: { energy_kcal_100g: 350 },
      allergens_tags: ['en:gluten'],
    },
  });

  assertEquals(product, {
    barcode: '012345678905',
    brand: 'Test Brand',
    name: 'Penne Pasta',
    ingredientText: 'Durum wheat semolina, water.',
    nutrition: { energy_kcal_100g: 350 },
    allergens: ['en:gluten'],
    dataSource: 'open_food_facts',
    sourceConfidence: 'medium',
  });
});

Deno.test('productFromOpenFoodFactsPayload rejects unknown products', () => {
  assertThrows(
    () => productFromOpenFoodFactsPayload('012345678905', { status: 0 }),
    ApiError,
    'We could not find that barcode yet.',
  );
});

Deno.test('productFromOpenFoodFactsPayload rejects products without ingredients', () => {
  assertThrows(
    () => productFromOpenFoodFactsPayload('012345678905', {
      status: 1,
      product: { product_name: 'Penne Pasta' },
    }),
    ApiError,
    'That product is missing ingredient details.',
  );
});
