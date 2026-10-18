import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import {
  InvalidPricingRecommendationError,
  PricingAiProviderUnavailableError,
  PricingAiTimeoutError,
  type PricingRecommender,
} from "../src/services/ai/pricingRecommender.js";
import { OllamaPricingRecommender } from "../src/services/ai/ollamaPricingRecommender.js";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/ledger_test";
const { createPricingRouter } = await import("../src/routes/pricing.js");

async function postRecommendationWith(
  pricingRecommender: PricingRecommender,
): Promise<{
  status: number;
  payload: unknown;
}> {
  const app = express();
  app.use(express.json());
  app.use("/api/pricing", createPricingRouter(pricingRecommender));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("The test server did not bind to a TCP port.");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/pricing/recommend`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calculation: { unitCost: 10, markupPercent: 25 },
        }),
      },
    );
    return { status: response.status, payload: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve();
      });
    });
  }
}

function postRecommendation(error: Error): Promise<{
  status: number;
  payload: unknown;
}> {
  return postRecommendationWith({
    async recommendPricing() {
      throw error;
    },
  });
}

function assertErrorResponse(
  payload: unknown,
  expectedCode: string,
  expectedMessage: RegExp,
): void {
  assert.ok(typeof payload === "object" && payload !== null);
  assert.equal("success" in payload && payload.success, false);
  assert.ok("error" in payload);
  const error = payload.error;
  assert.ok(typeof error === "object" && error !== null);
  assert.equal("code" in error && error.code, expectedCode);
  assert.ok("message" in error && typeof error.message === "string");
  assert.match(error.message, expectedMessage);
}

test("maps pricing inference timeout to HTTP 504 without provider-unavailable wording", async () => {
  const result = await postRecommendation(new PricingAiTimeoutError());

  assert.equal(result.status, 504);
  assertErrorResponse(
    result.payload,
    "AI_PROVIDER_TIMEOUT",
    /increase AI_PRICING_TIMEOUT_MS/i,
  );
});

test("keeps connection/provider failures mapped to HTTP 503", async () => {
  const result = await postRecommendation(
    new PricingAiProviderUnavailableError(),
  );

  assert.equal(result.status, 503);
  assertErrorResponse(result.payload, "AI_PROVIDER_UNAVAILABLE", /unavailable/i);
});

test("keeps invalid model output mapped to HTTP 502", async () => {
  const result = await postRecommendation(
    new InvalidPricingRecommendationError("model_schema_validation"),
  );

  assert.equal(result.status, 502);
  assertErrorResponse(result.payload, "INVALID_AI_OUTPUT", /invalid pricing recommendation/i);
  assert.ok(typeof result.payload === "object" && result.payload !== null);
  assert.ok("error" in result.payload);
  assert.ok(
    typeof result.payload.error === "object" &&
      result.payload.error !== null &&
      "details" in result.payload.error &&
      typeof result.payload.error.details === "object" &&
      result.payload.error.details !== null &&
      "reason" in result.payload.error.details &&
      result.payload.error.details.reason === "model_schema_validation",
  );
});

test("maps model prose rejected by the qualitative schema to HTTP 502", async () => {
  const modelOutput = {
    suggestedPrice: 12,
    priceRange: { minimum: 11, maximum: 13 },
    explanation: "A price of 12 may fit the intended customer.",
    assumptions: ["Customers value the product quality."],
    missingInformation: ["Local competitor positioning."],
    affordabilityVsProfit:
      "A lower price may feel more accessible, while a higher price improves gross profit.",
    scenarios: [],
  };
  const recommender = new OllamaPricingRecommender(
    "http://127.0.0.1:11434",
    "gemma3:4b",
    180_000,
    async () =>
      new Response(
        JSON.stringify({
          done_reason: "stop",
          message: { content: JSON.stringify(modelOutput) },
        }),
        { status: 200 },
      ),
  );

  const result = await postRecommendationWith(recommender);

  assert.equal(result.status, 502);
  assertErrorResponse(
    result.payload,
    "INVALID_AI_OUTPUT",
    /invalid pricing recommendation/i,
  );
});

test("returns deterministic ordered scenario prices when model labels are shuffled", async () => {
  const modelOutput = {
    suggestedPrice: 12,
    priceRange: { minimum: 11, maximum: 14 },
    explanation: "This position balances accessibility and product value.",
    assumptions: ["Customers value the product quality."],
    missingInformation: ["Local competitor positioning."],
    affordabilityVsProfit:
      "A lower price may feel more accessible, while a higher price improves gross profit.",
    scenarios: [
      {
        level: "higher-margin",
        rationale: "A premium position may improve gross profit.",
      },
      {
        level: "conservative",
        rationale: "A cautious position may reduce purchase friction.",
      },
      {
        level: "balanced",
        rationale: "A balanced position considers accessibility and profit.",
      },
    ],
  };
  const recommender = new OllamaPricingRecommender(
    "http://127.0.0.1:11434",
    "gemma3:4b",
    180_000,
    async () =>
      new Response(
        JSON.stringify({
          done_reason: "stop",
          message: { content: JSON.stringify(modelOutput) },
        }),
        { status: 200 },
      ),
  );

  const result = await postRecommendationWith(recommender);

  assert.equal(result.status, 200);
  assert.ok(typeof result.payload === "object" && result.payload !== null);
  assert.ok("data" in result.payload);
  const data = result.payload.data;
  assert.ok(typeof data === "object" && data !== null);
  assert.ok("recommendation" in data);
  const recommendation = data.recommendation;
  assert.ok(typeof recommendation === "object" && recommendation !== null);
  assert.ok("scenarios" in recommendation);
  assert.deepEqual(
    (
      recommendation.scenarios as Array<{
        level: string;
        result: { price: number; grossProfitPerUnit: number };
      }>
    ).map(({ level, result: price }) => ({
      level,
      price: price.price,
      grossProfitPerUnit: price.grossProfitPerUnit,
    })),
    [
      { level: "conservative", price: 11, grossProfitPerUnit: 1 },
      { level: "balanced", price: 12.5, grossProfitPerUnit: 2.5 },
      { level: "higher-margin", price: 14, grossProfitPerUnit: 4 },
    ],
  );
});
