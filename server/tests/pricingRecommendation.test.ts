import assert from "node:assert/strict";
import { test } from "node:test";
import { pricingRecommendationRequestSchema } from "../src/schemas/pricingRecommendation.js";
import { modelPricingRecommendationJsonSchema } from "../src/schemas/pricingRecommendation.js";
import { calculatePricing } from "../src/services/pricingCalculator.js";
import { normalizePricingRecommendation } from "../src/services/ai/normalizePricingRecommendation.js";
import {
  InvalidPricingRecommendationError,
  PricingAiTimeoutError,
  PricingAiProviderUnavailableError,
  type PricingRecommender,
} from "../src/services/ai/pricingRecommender.js";
import { OllamaPricingRecommender } from "../src/services/ai/ollamaPricingRecommender.js";
import { createPricingRecommendation } from "../src/services/pricingRecommendation.js";

const request = pricingRecommendationRequestSchema.parse({
  calculation: {
    unitCost: 10,
    additionalCosts: 2,
    markupPercent: 25,
    quantity: 3,
    targetMarginPercent: 20,
  },
  context: {
    currency: "USD",
    productDescription: "Handmade ceramic mug",
    intendedCustomer: "Gift buyers",
  },
});
const deterministicCalculation = calculatePricing({
  unitCost: 10,
  additionalCosts: 0,
  markupPercent: 20,
  quantity: 1,
});
const requestCalculation = calculatePricing(request.calculation);

const validModelOutput = {
  suggestedPrice: 16,
  priceRange: { minimum: 15, maximum: 20 },
  explanation: "The chosen position balances the stated goal with a clear per-unit return.",
  assumptions: ["Customers value the handmade finish."],
  missingInformation: ["Local competitor prices."],
  affordabilityVsProfit: "A lower price may be easier to trial, while a higher price retains more gross profit per sale.",
  scenarios: [
    {
      level: "conservative",
      rationale: "A lower position may reduce purchase friction.",
    },
    {
      level: "balanced",
      rationale: "A middle position balances accessibility and gross profit.",
    },
    {
      level: "higher-margin",
      rationale: "A higher position increases gross profit if customers accept it.",
    },
  ],
};

function fixedRecommender(output: unknown): PricingRecommender {
  return {
    async recommendPricing() {
      return output;
    },
  };
}

test("valid recommendations use deterministic gross-profit calculations", async () => {
  let observedCalculation: unknown;
  const recommender: PricingRecommender = {
    async recommendPricing(calculation, minimumPrice) {
      observedCalculation = calculation;
      assert.equal(minimumPrice, 15);
      return validModelOutput;
    },
  };

  const result = await createPricingRecommendation(request, recommender);

  assert.deepEqual(observedCalculation, requestCalculation);
  assert.deepEqual(result.calculation, requestCalculation);
  assert.equal(result.calculation.sellingPricePerUnit, 15);
  assert.equal(result.recommendation.suggestedPrice.price, 16);
  assert.equal(result.recommendation.suggestedPrice.grossProfitPerUnit, 4);
  assert.equal(result.recommendation.suggestedPrice.projectedGrossProfit, 12);
  assert.equal(result.recommendation.scenarios[0]?.result.price, 15);
  assert.equal(result.recommendation.scenarios[1]?.result.price, 17.5);
  assert.equal(result.recommendation.scenarios[2]?.result.price, 20);
  assert.equal(result.recommendation.scenarios[1]?.result.grossProfitPerUnit, 5.5);
  assert.equal(result.recommendation.scenarios[1]?.result.projectedGrossProfit, 16.5);
  assert.equal(result.recommendation.marketEvidenceProvided, false);
  assert.match(result.recommendation.marketValidationNote, /not market-validated/i);
});

test("raises a rounded target price when it would miss the requested margin", async () => {
  const smallCostRequest = pricingRecommendationRequestSchema.parse({
    calculation: {
      unitCost: 0.03,
      markupPercent: 20,
      quantity: 1,
      targetMarginPercent: 10,
    },
  });
  let minimumPriceSentToModel = 0;
  const result = await createPricingRecommendation(smallCostRequest, {
    async recommendPricing(_calculation, minimumPrice) {
      minimumPriceSentToModel = minimumPrice;
      return {
        suggestedPrice: 0.04,
        priceRange: { minimum: 0.04, maximum: 0.05 },
        explanation: "The rounded minimum preserves the intended return.",
        assumptions: [],
        missingInformation: [],
        affordabilityVsProfit: "A modestly higher price may support a stronger return.",
        scenarios: [],
      };
    },
  });

  assert.equal(result.calculation.targetMargin?.sellingPricePerUnit, 0.03);
  assert.equal(minimumPriceSentToModel, 0.04);
  assert.equal(result.recommendation.suggestedPrice.grossProfitMarginPercent, 25);
});

test("accepts a floor-priced recommendation when cost components round up separately", async () => {
  const subCentRequest = pricingRecommendationRequestSchema.parse({
    calculation: {
      unitCost: 1.005,
      additionalCosts: 1.005,
      markupPercent: 20,
      quantity: 2,
    },
  });
  let floor = 0;
  const result = await createPricingRecommendation(subCentRequest, {
    async recommendPricing(_calculation, minimumPrice) {
      floor = minimumPrice;
      return {
        suggestedPrice: minimumPrice,
        priceRange: { minimum: minimumPrice, maximum: minimumPrice + 1 },
        explanation: "A cautious position near cost.",
        assumptions: [],
        missingInformation: [],
        affordabilityVsProfit: "Lower prices trade profit for affordability.",
        scenarios: [],
      };
    },
  });

  assert.equal(floor, 2.01);
  assert.equal(result.calculation.totalUnitCost, 2.01);
  assert.equal(result.recommendation.suggestedPrice.price, 2.01);
  assert.equal(result.recommendation.suggestedPrice.grossProfitPerUnit, 0);
  assert.equal(result.recommendation.suggestedPrice.projectedGrossProfit, 0);
});

test("still rejects a price one cent below the floor and reports the failed condition", async () => {
  const subCentRequest = pricingRecommendationRequestSchema.parse({
    calculation: { unitCost: 1.005, additionalCosts: 1.005, markupPercent: 20 },
  });
  await assert.rejects(
    createPricingRecommendation(subCentRequest, {
      async recommendPricing(_calculation, minimumPrice) {
        return {
          suggestedPrice: minimumPrice + 0.5,
          priceRange: { minimum: minimumPrice - 0.01, maximum: minimumPrice + 1 },
          explanation: "A cautious position near cost.",
          assumptions: [],
          missingInformation: [],
          affordabilityVsProfit: "Lower prices trade profit for affordability.",
          scenarios: [],
        };
      },
    }),
    (error: unknown) =>
      error instanceof InvalidPricingRecommendationError &&
      error.reason === "price_validation" &&
      error.diagnostics?.condition === "price_below_minimum" &&
      error.diagnostics?.field === "priceRange.minimum" &&
      error.diagnostics?.minimumPrice === 2.01,
  );
});

test("rejects malformed structured model output", () => {
  assert.throws(
    () =>
      normalizePricingRecommendation(
        { ...validModelOutput, unrecognized: "field" },
        requestCalculation,
        3,
        15,
        request.context,
      ),
    InvalidPricingRecommendationError,
  );

  assert.throws(
    () =>
      normalizePricingRecommendation(
        {
          ...validModelOutput,
          scenarios: [
            { ...validModelOutput.scenarios[0], price: 99 },
            ...validModelOutput.scenarios.slice(1),
          ],
        },
        requestCalculation,
        3,
        15,
        request.context,
      ),
    InvalidPricingRecommendationError,
  );

  assert.throws(
    () =>
      normalizePricingRecommendation(
        {
          ...validModelOutput,
          scenarios: validModelOutput.scenarios.slice(0, 1),
        },
        requestCalculation,
        3,
        15,
        request.context,
      ),
    InvalidPricingRecommendationError,
  );
});

test("rejects unverified financial figures in model prose", async () => {
  const outputWithFigure = {
    ...validModelOutput,
    explanation: "A price of 18 would be a good place to start.",
  };
  await assert.rejects(
    createPricingRecommendation(request, fixedRecommender(outputWithFigure)),
    InvalidPricingRecommendationError,
  );
});

test("publishes the qualitative-text rule in the Ollama JSON schema", () => {
  const properties =
    modelPricingRecommendationJsonSchema.properties as Record<
      string,
      { description?: string; pattern?: string }
    >;
  assert.match(properties.explanation?.pattern ?? "", /\\p\{Sc\}/);
  assert.match(properties.explanation?.pattern ?? "", /\\d/);
  assert.match(properties.explanation?.pattern ?? "", /%/);
  assert.match(
    properties.explanation?.description ?? "",
    /do not include digits, currency symbols, or percent signs/i,
  );
  assert.match(
    (
      modelPricingRecommendationJsonSchema.properties.scenarios as {
        description?: string;
      }
    ).description ?? "",
    /server derives all scenario prices from the validated price range/i,
  );
});

test("rejects prices below cost or the requested margin floor", async () => {
  const invalidPrice = {
    ...validModelOutput,
    suggestedPrice: 14,
    priceRange: { minimum: 14, maximum: 20 },
    scenarios: [],
  };
  await assert.rejects(
    createPricingRecommendation(request, fixedRecommender(invalidPrice)),
    InvalidPricingRecommendationError,
  );
});

test("rejects an inconsistent range and derives scenario prices in level order", async () => {
  const invalidRange = {
    ...validModelOutput,
    priceRange: { minimum: 17, maximum: 16 },
  };
  await assert.rejects(
    createPricingRecommendation(request, fixedRecommender(invalidRange)),
    InvalidPricingRecommendationError,
  );

  const unordered = {
    ...validModelOutput,
    scenarios: [
      validModelOutput.scenarios[2],
      validModelOutput.scenarios[0],
      validModelOutput.scenarios[1],
    ],
  };
  const result = await createPricingRecommendation(
    request,
    fixedRecommender(unordered),
  );

  assert.deepEqual(
    result.recommendation.scenarios.map(({ level, result: price }) => ({
      level,
      price: price.price,
    })),
    [
      { level: "conservative", price: 15 },
      { level: "balanced", price: 17.5 },
      { level: "higher-margin", price: 20 },
    ],
  );
});

test("omits scenarios when the validated range cannot hold three distinct cent prices", async () => {
  const narrowRange = {
    ...validModelOutput,
    suggestedPrice: 15.01,
    priceRange: { minimum: 15, maximum: 15.01 },
  };
  const result = await createPricingRecommendation(
    request,
    fixedRecommender(narrowRange),
  );

  assert.deepEqual(result.recommendation.scenarios, []);
});

test("maps Ollama transport failures to a safe provider error", async () => {
  const recommender = new OllamaPricingRecommender(
    "http://127.0.0.1:11434",
    "gemma3:4b",
    180_000,
    async () => {
      throw new Error("private connection detail");
    },
  );

  await assert.rejects(
    recommender.recommendPricing(
      deterministicCalculation,
      10,
      {},
    ),
    (error: unknown) =>
      error instanceof PricingAiProviderUnavailableError &&
      !error.message.includes("private connection detail"),
  );
});

test("maps invalid Ollama response and malformed recommendation JSON safely", async () => {
  const recommender = new OllamaPricingRecommender(
    "http://127.0.0.1:11434",
    "gemma3:4b",
    180_000,
    async () =>
      new Response(
        JSON.stringify({
          done_reason: "stop",
          message: { content: "not JSON" },
        }),
        { status: 200 },
      ),
  );

  await assert.rejects(
    recommender.recommendPricing(
      deterministicCalculation,
      10,
      {},
    ),
    InvalidPricingRecommendationError,
  );
});

test("maps an inference timeout to its distinct timeout error", async () => {
  let receivedSignal: AbortSignal | null = null;
  const recommender = new OllamaPricingRecommender(
    "http://127.0.0.1:11434",
    "gemma3:4b",
    180_000,
    async (_input, init) => {
      if (init?.signal instanceof AbortSignal) {
        receivedSignal = init.signal;
      }
      throw new DOMException("inference deadline expired", "TimeoutError");
    },
  );

  await assert.rejects(
    recommender.recommendPricing(deterministicCalculation, 10, {}),
    (error: unknown) => error instanceof PricingAiTimeoutError,
  );
  assert.ok(receivedSignal instanceof AbortSignal);
});

test("classifies connection refusal as provider unavailable, not timeout", async () => {
  const connectionError = new TypeError("fetch failed", {
    cause: Object.assign(new Error("connection refused"), {
      code: "ECONNREFUSED",
    }),
  });
  const recommender = new OllamaPricingRecommender(
    "http://127.0.0.1:11434",
    "gemma3:4b",
    180_000,
    async () => {
      throw connectionError;
    },
  );

  await assert.rejects(
    recommender.recommendPricing(deterministicCalculation, 10, {}),
    (error: unknown) =>
      error instanceof PricingAiProviderUnavailableError &&
      !(error instanceof PricingAiTimeoutError) &&
      !error.message.includes("connection refused"),
  );
});
