import type { PricingCalculation } from "../pricingCalculator.js";
import type { PricingRecommendationContext } from "../../schemas/pricingRecommendation.js";

export interface PricingRecommender {
  recommendPricing(
    calculation: PricingCalculation,
    minimumPrice: number,
    context: PricingRecommendationContext,
  ): Promise<unknown>;
}

export type PricingRecommendationFailureReason =
  | "invalid_provider_response"
  | "invalid_model_json"
  | "model_schema_validation"
  | "price_validation"
  | "price_range_validation"
  | "scenario_validation"
  | "calculation_validation"
  | "recommendation_normalization";

export class PricingAiProviderUnavailableError extends Error {
  constructor() {
    super("Local pricing AI provider is unavailable.");
    this.name = "PricingAiProviderUnavailableError";
  }
}

export class PricingAiTimeoutError extends Error {
  constructor() {
    super("The local pricing AI request timed out.");
    this.name = "PricingAiTimeoutError";
  }
}

export type PricingRecommendationDiagnostics = Record<
  string,
  string | number | boolean | null
>;

export class InvalidPricingRecommendationError extends Error {
  constructor(
    readonly reason: PricingRecommendationFailureReason = "recommendation_normalization",
    readonly diagnostics?: PricingRecommendationDiagnostics,
  ) {
    super("The local AI provider returned an invalid pricing recommendation.");
    this.name = "InvalidPricingRecommendationError";
  }
}
