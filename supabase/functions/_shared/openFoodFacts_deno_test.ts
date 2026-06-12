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

Deno.test('productFromUsdaPayload maps a branded match by GTIN', async () => {
  const { productFromUsdaPayload } = await import('./openFoodFacts.ts');
  const product = productFromUsdaPayload('012345678905', {
    foods: [
      {
        gtinUpc: '00012345678905',
        description: 'TOMATO BASIL PASTA SAUCE',
        brandOwner: 'Test Foods Inc',
        ingredients: 'Tomatoes, basil, garlic, onion powder.',
        labelNutrients: { calories: { value: 60 } },
      },
    ],
  });

  assertEquals(product.name, 'TOMATO BASIL PASTA SAUCE');
  assertEquals(product.dataSource, 'usda_fdc');
  assertEquals(product.ingredientText, 'Tomatoes, basil, garlic, onion powder.');
});

Deno.test('productFromUsdaPayload rejects when no GTIN matches', async () => {
  const { productFromUsdaPayload } = await import('./openFoodFacts.ts');
  assertThrows(
    () => productFromUsdaPayload('012345678905', { foods: [{ gtinUpc: '99999', description: 'X', ingredients: 'y' }] }),
    ApiError,
  );
});

Deno.test('stripAllergenStatements removes contains/may-contain declarations', async () => {
  const { stripAllergenStatements } = await import('./openFoodFacts.ts');
  assertEquals(
    stripAllergenStatements('Oats, peanuts, cane sugar. CONTAINS: PEANUTS, SOYBEANS. May contain wheat.'),
    'Oats, peanuts, cane sugar.',
  );
  assertEquals(
    stripAllergenStatements('Milk, cocoa. Allergens: milk, soy'),
    'Milk, cocoa.',
  );
});
