import {
  modelPricingRecommendationSchema,
  type PricingRecommendationContext,
} from "../../schemas/pricingRecommendation.js";
import {
  calculatePricing,
  PricingPrecisionError,
  type PricingCalculation,
} from "../pricingCalculator.js";
import { InvalidPricingRecommendationError } from "./pricingRecommender.js";

export interface VerifiedPrice {
  price: number;
  grossProfitPerUnit: number;
  projectedGrossProfit: number;
  grossProfitMarginPercent: number | null;
}

export interface NormalizedPricingRecommendation {
  suggestedPrice: VerifiedPrice;
  priceRange: {
    minimum: VerifiedPrice;
    maximum: VerifiedPrice;
  };
  explanation: string;
  assumptions: string[];
  missingInformation: string[];
  affordabilityVsProfit: string;
  scenarios: Array<{
    level: "conservative" | "balanced" | "higher-margin";
    rationale: string;
    result: VerifiedPrice;
  }>;
  marketEvidenceProvided: boolean;
  marketValidationNote: string;
}

function priceFailure(
  field: string,
  condition: string,
  values: Record<string, number>,
): InvalidPricingRecommendationError {
  return new InvalidPricingRecommendationError("price_validation", {
    field,
    condition,
    ...values,
  });
}

function normalizePrice(price: number, field: string): number {
  if (!Number.isFinite(price) || price <= 0) {
    throw priceFailure(field, "price_not_positive_finite", {
      modelPrice: Number.isFinite(price) ? price : -1,
    });
  }
  return Math.round((price + Number.EPSILON) * 100) / 100;
}

function verifyPrice(
  price: number,
  calculation: PricingCalculation,
  minimumPrice: number,
  quantity: number,
  field: string,
): VerifiedPrice {
  const normalizedPrice = normalizePrice(price, field);
  if (normalizedPrice < minimumPrice) {
    throw priceFailure(field, "price_below_minimum", {
      modelPrice: price,
      roundedPrice: normalizedPrice,
      minimumPrice,
      totalUnitCost: calculation.totalUnitCost,
    });
  }

  let verified: PricingCalculation;
  try {
    // The floor sent to the model derives from totalUnitCost, so verify against
    // that same total rather than re-summing separately rounded components.
    verified = calculatePricing({
      unitCost: calculation.totalUnitCost,
      additionalCosts: 0,
      markupPercent: calculation.markupPercent,
      quantity,
      alternativePrices: [normalizedPrice],
    });
  } catch (error) {
    throw priceFailure(field, "deterministic_calculation_failed", {
      roundedPrice: normalizedPrice,
      errorIsPrecision: error instanceof PricingPrecisionError ? 1 : 0,
    });
  }

  const [alternative] = verified.alternatives;
  if (!alternative) {
    throw priceFailure(field, "alternative_missing", {
      roundedPrice: normalizedPrice,
    });
  }
  if (alternative.grossProfitPerUnit < 0) {
    throw priceFailure(field, "negative_gross_profit", {
      roundedPrice: normalizedPrice,
      grossProfitPerUnit: alternative.grossProfitPerUnit,
      totalUnitCost: calculation.totalUnitCost,
    });
  }
  if (alternative.sellingPricePerUnit < minimumPrice) {
    throw priceFailure(field, "verified_price_below_minimum", {
      roundedPrice: normalizedPrice,
      verifiedPrice: alternative.sellingPricePerUnit,
      minimumPrice,
    });
  }

  return {
    price: alternative.sellingPricePerUnit,
    grossProfitPerUnit: alternative.grossProfitPerUnit,
    projectedGrossProfit: alternative.projectedGrossProfit,
    grossProfitMarginPercent: alternative.grossProfitMarginPercent,
  };
}

export function normalizePricingRecommendation(
  output: unknown,
  calculation: PricingCalculation,
  quantity: number,
  minimumPrice: number,
  context: PricingRecommendationContext,
): NormalizedPricingRecommendation {
  const parsed = modelPricingRecommendationSchema.safeParse(output);
  if (!parsed.success) {
    throw new InvalidPricingRecommendationError("model_schema_validation");
  }

  try {
    const suggestion = parsed.data;
    const suggestedPrice = verifyPrice(
      suggestion.suggestedPrice,
      calculation,
      minimumPrice,
      quantity,
      "suggestedPrice",
    );
    const rangeMinimum = verifyPrice(
      suggestion.priceRange.minimum,
      calculation,
      minimumPrice,
      quantity,
      "priceRange.minimum",
    );
    const rangeMaximum = verifyPrice(
      suggestion.priceRange.maximum,
      calculation,
      minimumPrice,
      quantity,
      "priceRange.maximum",
    );
    if (
      rangeMinimum.price > rangeMaximum.price ||
      suggestedPrice.price < rangeMinimum.price ||
      suggestedPrice.price > rangeMaximum.price
    ) {
      throw new InvalidPricingRecommendationError("price_range_validation");
    }

    if (
      suggestion.scenarios.length !== 0 &&
      suggestion.scenarios.length !== 3
    ) {
      throw new InvalidPricingRecommendationError("scenario_validation");
    }

    const scenarios =
      suggestion.scenarios.length === 3
        ? (() => {
            const minimumCents = Math.round(rangeMinimum.price * 100);
            const maximumCents = Math.round(rangeMaximum.price * 100);
            const midpointCents = Math.round(
              (minimumCents + maximumCents) / 2,
            );
            if (
              minimumCents >= midpointCents ||
              midpointCents >= maximumCents
            ) {
              return [];
            }

            const priceByLevel = {
              conservative: minimumCents / 100,
              balanced: midpointCents / 100,
              "higher-margin": maximumCents / 100,
            };
            return (
              ["conservative", "balanced", "higher-margin"] as const
            ).map((level) => {
              const scenario = suggestion.scenarios.find(
                (candidate) => candidate.level === level,
              );
              if (!scenario) {
                throw new InvalidPricingRecommendationError("scenario_validation");
              }
              return {
                level,
                rationale: scenario.rationale,
                result: verifyPrice(
                  priceByLevel[level],
                  calculation,
                  minimumPrice,
                  quantity,
                  `scenarios.${level}`,
                ),
              };
            });
          })()
        : [];
    if (scenarios.length > 0) {
      const conservative = scenarios.find(
        ({ level }) => level === "conservative",
      );
      const balanced = scenarios.find(({ level }) => level === "balanced");
      const higherMargin = scenarios.find(
        ({ level }) => level === "higher-margin",
      );
      if (
        scenarios.length !== 3 ||
        !conservative ||
        !balanced ||
        !higherMargin ||
        conservative.result.price >= balanced.result.price ||
        balanced.result.price >= higherMargin.result.price
      ) {
        throw new InvalidPricingRecommendationError("scenario_validation");
      }
    }

    return {
      suggestedPrice,
      priceRange: { minimum: rangeMinimum, maximum: rangeMaximum },
      explanation: suggestion.explanation,
      assumptions: suggestion.assumptions,
      missingInformation: suggestion.missingInformation,
      affordabilityVsProfit: suggestion.affordabilityVsProfit,
      scenarios,
      marketEvidenceProvided: Boolean(context.marketEvidence?.trim()),
      marketValidationNote: context.marketEvidence?.trim()
        ? "This recommendation uses market context supplied by you; it has not been independently verified."
        : "This recommendation is not market-validated because no market evidence was supplied.",
    };
  } catch (error) {
    if (error instanceof InvalidPricingRecommendationError) {
      throw error;
    }
    throw new InvalidPricingRecommendationError("recommendation_normalization");
  }
}
