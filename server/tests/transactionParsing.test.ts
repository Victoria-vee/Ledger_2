import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AiProviderUnavailableError,
  InvalidAiModelOutputError,
} from "../src/services/ai/transactionParser.js";
import { OllamaTransactionParser } from "../src/services/ai/ollamaTransactionParser.js";
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

test("reports an unavailable Ollama runtime without exposing network errors", async () => {
  const parser = new OllamaTransactionParser(
    "http://127.0.0.1:11434",
    "gemma3:4b",
    async () => {
      throw new Error("private transport detail");
    },
  );

  await assert.rejects(
    parser.parseTransactions("Received 500 today.", referenceDate),
    AiProviderUnavailableError,
  );
});

test("rejects malformed JSON returned by Ollama", async () => {
  const parser = new OllamaTransactionParser(
    "http://127.0.0.1:11434",
    "gemma3:4b",
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
    parser.parseTransactions("Received 500 today.", referenceDate),
    InvalidAiModelOutputError,
  );
});

test("accepts valid Ollama JSON output for subsequent server validation", async () => {
  const parser = new OllamaTransactionParser(
    "http://127.0.0.1:11434",
    "gemma3:4b",
    async () =>
      new Response(
        JSON.stringify({
          done_reason: "stop",
          message: { content: JSON.stringify(validModelOutput) },
        }),
        { status: 200 },
      ),
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
