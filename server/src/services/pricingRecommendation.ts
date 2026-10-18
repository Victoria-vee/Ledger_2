import type { PricingRecommendationRequest } from "../schemas/pricingRecommendation.js";
import {
  calculatePricing,
  type PricingCalculation,
} from "./pricingCalculator.js";
import {
  normalizePricingRecommendation,
  type NormalizedPricingRecommendation,
} from "./ai/normalizePricingRecommendation.js";
import {
  InvalidPricingRecommendationError,
  type PricingRecommender,
} from "./ai/pricingRecommender.js";

export interface PricingRecommendationResponse {
  calculation: PricingCalculation;
  recommendation: NormalizedPricingRecommendation;
}

export async function createPricingRecommendation(
  input: PricingRecommendationRequest,
  recommender: PricingRecommender,
): Promise<PricingRecommendationResponse> {
  const calculation = calculatePricing(input.calculation);
  let minimumPrice = Math.max(
    0.01,
    calculation.targetMargin?.sellingPricePerUnit ??
      calculation.totalUnitCost,
  );
  if (input.calculation.targetMarginPercent !== undefined) {
    const atCalculatedTarget = calculatePricing({
      ...input.calculation,
      quantity: 1,
      alternativePrices: [minimumPrice],
    }).alternatives[0];
    if (
      !atCalculatedTarget ||
      atCalculatedTarget.grossProfitMarginPercent === null
    ) {
      throw new InvalidPricingRecommendationError("calculation_validation");
    }
    if (
      atCalculatedTarget.grossProfitMarginPercent <
      input.calculation.targetMarginPercent
    ) {
      minimumPrice = Math.round((minimumPrice + 0.01) * 100) / 100;
    }
  }
  const modelOutput = await recommender.recommendPricing(
    calculation,
    minimumPrice,
    input.context,
  );
  const recommendation = normalizePricingRecommendation(
    modelOutput,
    calculation,
    input.calculation.quantity,
    minimumPrice,
    input.context,
  );

  return { calculation, recommendation };
}
