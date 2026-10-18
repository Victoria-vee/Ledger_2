import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import { TransactionModel } from "../src/models/transaction.js";
import {
  createTransactionSchema,
  updateTransactionSchema,
} from "../src/schemas/transaction.js";

const transactionDetails = {
  type: "income" as const,
  description: "Customer payment",
  amount: 250,
};

test("accepts supported transaction currencies and normalizes their case", () => {
  for (const currency of ["NGN", "USD", "GBP"]) {
    const parsed = createTransactionSchema.safeParse({
      ...transactionDetails,
      currency: currency.toLowerCase(),
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.currency, currency);
    }
  }
});

test("keeps currency optional for legacy transaction payloads", () => {
  const parsed = createTransactionSchema.safeParse(transactionDetails);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.currency, undefined);
  }
});

test("accepts currency changes when editing a transaction", () => {
  const parsed = updateTransactionSchema.safeParse({ currency: "gbp" });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.currency, "GBP");
  }
});

test("transaction model supports both currency-bearing and legacy records", async () => {
  const legacy = new TransactionModel({
    businessId: new Types.ObjectId(),
    ...transactionDetails,
    date: new Date(),
  });
  const currencyBearing = new TransactionModel({
    businessId: new Types.ObjectId(),
    ...transactionDetails,
    currency: "USD",
    date: new Date(),
  });

  assert.equal(legacy.currency, undefined);
  await assert.doesNotReject(legacy.validate());
  assert.equal(currencyBearing.currency, "USD");
  await assert.doesNotReject(currencyBearing.validate());
});
