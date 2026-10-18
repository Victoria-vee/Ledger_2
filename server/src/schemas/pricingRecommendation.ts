import { z } from "zod";
import { calculatePricingSchema } from "./pricing.js";

export const pricingRecommendationContextSchema = z
  .object({
    currency: z.string().trim().min(1).max(12).optional(),
    businessType: z.string().trim().max(200).optional(),
    productDescription: z.string().trim().max(500).optional(),
    intendedCustomer: z.string().trim().max(300).optional(),
    perceivedQuality: z.string().trim().max(200).optional(),
    pricingGoal: z.string().trim().max(300).optional(),
    marketEvidence: z.string().trim().max(1000).optional(),
  })
  .strict();

export const pricingRecommendationRequestSchema = z
  .object({
    calculation: calculatePricingSchema,
    context: pricingRecommendationContextSchema.optional().default({}),
  })
  .strict();

function qualitativeText(maximumLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maximumLength)
    .regex(/^[^\d\p{Sc}%]+$/u, {
      message:
        "Use qualitative text only; financial figures are calculated by the server.",
    })
    .describe(
      "Qualitative prose only. Do not include digits, currency symbols, or percent signs. The server rejects those characters in prose; financial figures are supplied separately.",
    );
}

const modelPriceScenarioSchema = z
  .object({
    level: z.enum(["conservative", "balanced", "higher-margin"]),
    rationale: qualitativeText(500),
  })
  .strict();

export const modelPricingRecommendationSchema = z
  .object({
    suggestedPrice: z.number().finite().positive(),
    priceRange: z
      .object({
        minimum: z.number().finite().positive(),
        maximum: z.number().finite().positive(),
      })
      .strict(),
    explanation: qualitativeText(1000),
    assumptions: z.array(qualitativeText(300)).max(8),
    missingInformation: z.array(qualitativeText(300)).max(8),
    affordabilityVsProfit: qualitativeText(1000),
    scenarios: z
      .array(modelPriceScenarioSchema)
      .max(3)
      .describe(
        "Use either an empty array or exactly three unique scenarios, one for each level. Provide qualitative rationales only; the server derives all scenario prices from the validated price range.",
      ),
  })
  .strict()
  .refine(
    ({ scenarios }) =>
      new Set(scenarios.map(({ level }) => level)).size === scenarios.length,
    {
      path: ["scenarios"],
      message: "Scenario levels must be unique.",
    },
  );

export const modelPricingRecommendationJsonSchema = z.toJSONSchema(
  modelPricingRecommendationSchema,
);

export type PricingRecommendationContext = z.infer<
  typeof pricingRecommendationContextSchema
>;
export type PricingRecommendationRequest = z.output<
  typeof pricingRecommendationRequestSchema
>;
export type ModelPricingRecommendation = z.infer<
  typeof modelPricingRecommendationSchema
>;
