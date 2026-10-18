import { Router, type Response } from "express";
import { env } from "../config/env.js";
import { calculatePricingSchema } from "../schemas/pricing.js";
import { pricingRecommendationRequestSchema } from "../schemas/pricingRecommendation.js";
import {
  calculatePricing,
  PricingPrecisionError,
} from "../services/pricingCalculator.js";
import { OllamaPricingRecommender } from "../services/ai/ollamaPricingRecommender.js";
import {
  InvalidPricingRecommendationError,
  PricingAiProviderUnavailableError,
  PricingAiTimeoutError,
  type PricingRecommender,
} from "../services/ai/pricingRecommender.js";
import { createPricingRecommendation } from "../services/pricingRecommendation.js";

function sendValidationError<T extends { path: PropertyKey[]; message: string }>(
  response: Response,
  issues: T[],
): void {
  response.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      details: issues.map((issue) => ({
        field: issue.path.map(String).join(".") || "body",
        message: issue.message,
      })),
    },
  });
}

export function createPricingRouter(
  pricingRecommender: PricingRecommender,
): Router {
  const router = Router();

  router.post("/recommend", async (request, response) => {
    const parsed = pricingRecommendationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error.issues);
      return;
    }

    try {
      const data = await createPricingRecommendation(
        parsed.data,
        pricingRecommender,
      );
      response.json({ success: true, data });
    } catch (error) {
      if (error instanceof PricingAiTimeoutError) {
        response.status(504).json({
          success: false,
          error: {
            code: "AI_PROVIDER_TIMEOUT",
            message:
              "The local AI model did not respond within the configured timeout. Try again or increase AI_PRICING_TIMEOUT_MS.",
          },
        });
        return;
      }

      if (error instanceof PricingAiProviderUnavailableError) {
        response.status(503).json({
          success: false,
          error: {
            code: "AI_PROVIDER_UNAVAILABLE",
            message:
              "The local AI model is unavailable. Start Ollama and ensure the configured model is installed.",
          },
        });
        return;
      }

      if (error instanceof InvalidPricingRecommendationError) {
        console.warn(
          "Pricing recommendation rejected.",
          JSON.stringify({
            reason: error.reason,
            ...error.diagnostics,
          }),
        );
        response.status(502).json({
          success: false,
          error: {
            code: "INVALID_AI_OUTPUT",
            message:
              "The local AI model returned an invalid pricing recommendation. Try again or provide more pricing context.",
            details: { reason: error.reason },
          },
        });
        return;
      }

      if (error instanceof PricingPrecisionError) {
        sendValidationError(response, [
          { path: ["calculation"], message: error.message },
        ]);
        return;
      }

      throw error;
    }
  });

  router.post("/calculate", (request, response) => {
    const parsed = calculatePricingSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.map(String).join(".") || "body",
            message: issue.message,
          })),
        },
      });
      return;
    }

    try {
      response.json({
        success: true,
        data: calculatePricing(parsed.data),
      });
    } catch (error) {
      if (!(error instanceof PricingPrecisionError)) {
        throw error;
      }
      response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: [
            {
              field: "body",
              message: error.message,
            },
          ],
        },
      });
    }
  });

  return router;
}

export const pricingRouter = createPricingRouter(
  new OllamaPricingRecommender(
    env.AI_OLLAMA_BASE_URL,
    env.AI_MODEL,
    env.AI_PRICING_TIMEOUT_MS,
  ),
);
