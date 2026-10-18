import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePricingSchema } from "../src/schemas/pricing.js";
import {
  calculatePricing,
  PricingPrecisionError,
} from "../src/services/pricingCalculator.js";

test("preserves markup totals and returns gross profit metrics", () => {
  const input = calculatePricingSchema.parse({
    unitCost: 10,
    additionalCosts: 2,
    markupPercent: 25,
    quantity: 3,
  });

  assert.deepEqual(calculatePricing(input), {
    unitCost: 10,
    additionalCosts: 2,
    totalUnitCost: 12,
    markupPercent: 25,
    sellingPricePerUnit: 15,
    profitPerUnit: 3,
    grossProfitPerUnit: 3,
    grossProfitMarginPercent: 20,
    totalRevenue: 45,
    totalProfit: 9,
    targetMargin: null,
    alternatives: [],
  });
});

test("calculates a target margin price using the gross margin formula", () => {
  const input = calculatePricingSchema.parse({
    unitCost: 80,
    markupPercent: 0,
    targetMarginPercent: 25,
  });
  const result = calculatePricing(input);

  assert.equal(result.targetMargin?.sellingPricePerUnit, 106.67);
  assert.equal(result.targetMargin?.grossProfitPerUnit, 26.67);
  assert.equal(result.targetMargin?.grossProfitMarginPercent, 25);
});

test("rounds monetary results to cents while reporting percentages separately", () => {
  const input = calculatePricingSchema.parse({
    unitCost: 1,
    markupPercent: 0.5,
  });
  const result = calculatePricing(input);

  assert.equal(result.sellingPricePerUnit, 1.01);
  assert.equal(result.grossProfitPerUnit, 0.01);
  assert.equal(result.grossProfitMarginPercent, 0.5);
});

test("compares alternative prices using gross profit and sales quantity", () => {
  const input = calculatePricingSchema.parse({
    unitCost: 80,
    markupPercent: 0,
    quantity: 4,
    alternativePrices: [80, 100, 125],
  });
  const result = calculatePricing(input);

  assert.deepEqual(
    result.alternatives.map(
      ({ sellingPricePerUnit, grossProfitPerUnit, projectedGrossProfit }) => ({
        sellingPricePerUnit,
        grossProfitPerUnit,
        projectedGrossProfit,
      }),
    ),
    [
      { sellingPricePerUnit: 80, grossProfitPerUnit: 0, projectedGrossProfit: 0 },
      { sellingPricePerUnit: 100, grossProfitPerUnit: 20, projectedGrossProfit: 80 },
      { sellingPricePerUnit: 125, grossProfitPerUnit: 45, projectedGrossProfit: 180 },
    ],
  );
});

test("keeps zero cost valid but reports gross margin as unavailable at zero price", () => {
  const input = calculatePricingSchema.parse({
    unitCost: 0,
    markupPercent: 50,
  });
  const result = calculatePricing(input);

  assert.equal(result.sellingPricePerUnit, 0);
  assert.equal(result.grossProfitPerUnit, 0);
  assert.equal(result.grossProfitMarginPercent, null);
});

test("rejects invalid costs, quantities, target margins, and impossible target inputs", () => {
  const invalidInputs: unknown[] = [
    { unitCost: -1, markupPercent: 20 },
    { unitCost: 1, additionalCosts: -1, markupPercent: 20 },
    { unitCost: 1, markupPercent: 20, quantity: 0 },
    { unitCost: 1, markupPercent: 20, quantity: 1.5 },
    { unitCost: 1, markupPercent: 20, targetMarginPercent: 100 },
    { unitCost: 0, markupPercent: 20, targetMarginPercent: 25 },
    { unitCost: 1, markupPercent: 20, alternativePrices: [-1] },
    { unitCost: 1, markupPercent: 20, alternativePrices: [1, 2, 3, 4, 5, 6] },
  ];

  for (const input of invalidInputs) {
    assert.equal(calculatePricingSchema.safeParse(input).success, false);
  }
});

test("rejects a target price beyond supported monetary precision", () => {
  const input = calculatePricingSchema.parse({
    unitCost: 10,
    markupPercent: 0,
    targetMarginPercent: 99.9999999999999,
  });

  assert.throws(() => calculatePricing(input), PricingPrecisionError);
});
