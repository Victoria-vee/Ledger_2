import assert from "node:assert/strict";
import { completionWith, fakeOpenAiClient } from "./openaiFake.js";
import { test } from "node:test";
import {
  AiProviderUnavailableError,
  InvalidAiModelOutputError,
} from "../src/services/ai/transactionParser.js";
import { OpenAiTransactionParser } from "../src/services/ai/openaiTransactionParser.js";
import { normalizeTransactionDrafts } from "../src/services/ai/normalizeTransactionDrafts.js";

const referenceDate = "2026-10-16";

const validModelOutput = {
  drafts: [
    {
      type: "income",
      description: "Customer payment",
      amount: 5000,
      date: "today",
      category: "sales",
      amountEvidence: "5,000",
      dateEvidence: "today",
    },
  ],
  uncertainties: [],
};

test("normalizes a grounded draft and relative date", () => {
  const result = normalizeTransactionDrafts(
    validModelOutput,
    "Received 5,000 from a customer today.",
    referenceDate,
  );

  assert.deepEqual(result, {
    drafts: [
      {
        type: "income",
        description: "Customer payment",
        amount: 5000,
        date: referenceDate,
        category: "sales",
      },
    ],
    uncertainties: [],
    requiresReview: true,
  });
});

test("marks missing amount and ambiguous date for review", () => {
  const result = normalizeTransactionDrafts(
    {
      drafts: [
        {
          type: "expense",
          description: "Supplier payment",
          amount: null,
          date: null,
          amountEvidence: null,
          dateEvidence: null,
        },
      ],
      uncertainties: [],
    },
    "Paid the supplier, but the amount and date are not recorded.",
    referenceDate,
  );

  assert.equal(result.drafts[0]?.amount, null);
  assert.equal(result.drafts[0]?.date, null);
  assert.deepEqual(
    result.uncertainties.map(({ field }) => field),
    ["amount", "date"],
  );
  assert.equal(result.requiresReview, true);
});

test("rejects malformed model output and ungrounded amounts", () => {
  assert.throws(
    () =>
      normalizeTransactionDrafts(
        { ...validModelOutput, unexpected: true },
        "Received 5,000 today.",
        referenceDate,
      ),
    InvalidAiModelOutputError,
  );

  const result = normalizeTransactionDrafts(
    {
      drafts: [
        {
          ...validModelOutput.drafts[0],
          amount: 5000,
          amountEvidence: "Received 5,000 on 2026-10-16",
        },
      ],
      uncertainties: [],
    },
    "Received 5,000 on 2026-10-16.",
    referenceDate,
  );

  assert.equal(result.drafts[0]?.amount, null);
  assert.equal(result.uncertainties[0]?.field, "amount");
});

test("reports an unavailable OpenAI service without exposing network errors", async () => {
  const parser = new OpenAiTransactionParser(
    fakeOpenAiClient(async () => {
      throw new Error("private transport detail");
    }),
    "gpt-4o-mini",
  );

  await assert.rejects(
    parser.parseTransactions("Received 500 today.", referenceDate),
    AiProviderUnavailableError,
  );
});

test("rejects malformed JSON returned by OpenAI", async () => {
  const parser = new OpenAiTransactionParser(
    fakeOpenAiClient(async () =>
      completionWith("not JSON")),
    "gpt-4o-mini",
  );

  await assert.rejects(
    parser.parseTransactions("Received 500 today.", referenceDate),
    InvalidAiModelOutputError,
  );
});

test("accepts valid OpenAI JSON output for subsequent server validation", async () => {
  const parser = new OpenAiTransactionParser(
    fakeOpenAiClient(async () =>
      completionWith(JSON.stringify(validModelOutput))),
    "gpt-4o-mini",
  );

  const rawOutput = await parser.parseTransactions(
    "Received 5,000 from a customer today.",
    referenceDate,
  );
  const result = normalizeTransactionDrafts(
    rawOutput,
    "Received 5,000 from a customer today.",
    referenceDate,
  );
  assert.equal(result.drafts[0]?.amount, 5000);
});
