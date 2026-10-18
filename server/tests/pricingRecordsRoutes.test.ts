import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { Types } from "mongoose";
import { PricingRecordModel } from "../src/models/pricingRecord.js";
import {
  createBusinessPricingRecordsRouter,
  type PricingRecordDocument,
  type PricingRecordStore,
} from "../src/routes/pricingRecords.js";

const businessId = new Types.ObjectId("507f1f77bcf86cd799439011");
const otherBusinessId = new Types.ObjectId("507f1f77bcf86cd799439012");

function createStore(): {
  store: PricingRecordStore;
  records: PricingRecordDocument[];
} {
  const records: PricingRecordDocument[] = [];
  const store: PricingRecordStore = {
    async findBusinessCurrency(id) {
      return id.equals(businessId) || id.equals(otherBusinessId)
        ? "NGN"
        : null;
    },
    async findByIdempotencyKey(id, key) {
      return (
        records.find(
          (record) =>
            record.businessId.equals(id) && record.idempotencyKey === key,
        ) ?? null
      );
    },
    async createRecord(input) {
      if (
        records.some(
          (record) =>
            record.businessId.equals(input.businessId) &&
            record.idempotencyKey === input.idempotencyKey,
        )
      ) {
        throw Object.assign(new Error("Duplicate idempotency key."), {
          code: 11000,
        });
      }
      const record = new PricingRecordModel(input);
      record.createdAt = new Date();
      record.updatedAt = record.createdAt;
      records.push(record);
      return record;
    },
    async findBusinessRecords(id) {
      return records
        .filter((record) => record.businessId.equals(id))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    },
    async updateRecord(id, pricingRecordId, changes) {
      const record = records.find(
        (item) =>
          item.businessId.equals(id) &&
          item._id.equals(pricingRecordId),
      );
      if (!record) {
        return null;
      }
      Object.assign(record, changes);
      record.updatedAt = new Date(record.updatedAt.getTime() + 1000);
      return record;
    },
    async deleteRecord(id, pricingRecordId) {
      const index = records.findIndex(
        (record) =>
          record.businessId.equals(id) &&
          record._id.equals(pricingRecordId),
      );
      if (index === -1) {
        return false;
      }
      records.splice(index, 1);
      return true;
    },
  };
  return { store, records };
}

async function withServer(
  store: PricingRecordStore,
  callback: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/businesses/:businessId/pricing-records",
    createBusinessPricingRecordsRouter(store),
  );
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
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function standardInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "  Handmade Tote Bag  ",
    type: "product",
    currency: "NGN",
    calculation: {
      unitCost: 10,
      additionalCosts: 2,
      markupPercent: 25,
      quantity: 3,
    },
    calculationMethod: "standard",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

async function postRecord(
  baseUrl: string,
  body: unknown,
  id = businessId.toString(),
): Promise<{ status: number; payload: unknown }> {
  const response = await fetch(
    `${baseUrl}/api/businesses/${id}/pricing-records`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { status: response.status, payload: await response.json() };
}

async function requestRecordAction(
  baseUrl: string,
  method: "PATCH" | "DELETE",
  recordId: string,
  body?: unknown,
  id = businessId.toString(),
): Promise<{ status: number; payload: unknown }> {
  const response = await fetch(
    `${baseUrl}/api/businesses/${id}/pricing-records/${recordId}`,
    {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  return { status: response.status, payload: await response.json() };
}

function responseData(payload: unknown): Record<string, unknown> {
  assert.ok(typeof payload === "object" && payload !== null);
  assert.ok("data" in payload);
  assert.ok(typeof payload.data === "object" && payload.data !== null);
  return payload.data;
}

test("persists a standard price separately with server-calculated amount and timestamps", async () => {
  const { store, records } = createStore();
  await withServer(store, async (baseUrl) => {
    const response = await postRecord(baseUrl, standardInput());

    assert.equal(response.status, 201);
    const data = responseData(response.payload);
    assert.equal(data.name, "Handmade Tote Bag");
    assert.equal(data.type, "product");
    assert.equal(data.currency, "NGN");
    assert.equal(data.sellingPricePerUnit, 15);
    assert.equal(data.calculationMethod, "standard");
    assert.equal(data.businessId, businessId.toString());
    assert.equal(data.requestFingerprint, undefined);
    assert.equal(records.length, 1);
    assert.ok(records[0]?.createdAt instanceof Date);
    assert.ok(records[0]?.updatedAt instanceof Date);
  });
});

test("persists the selected AI price and validated recommendation metadata", async () => {
  const { store, records } = createStore();
  await withServer(store, async (baseUrl) => {
    const response = await postRecord(
      baseUrl,
      standardInput({
        calculation: {
          unitCost: 10,
          additionalCosts: 0,
          markupPercent: 25,
          quantity: 2,
        },
        calculationMethod: "ai",
        sellingPricePerUnit: 14,
        recommendationMetadata: {
          suggestedPrice: 12,
          minimumPrice: 11,
          maximumPrice: 15,
        },
      }),
    );

    assert.equal(response.status, 201);
    const data = responseData(response.payload);
    assert.equal(data.sellingPricePerUnit, 14);
    assert.equal(data.calculationMethod, "ai");
    assert.deepEqual(data.recommendationMetadata, {
      suggestedPrice: 12,
      minimumPrice: 11,
      maximumPrice: 15,
    });
    assert.equal(records.length, 1);
  });
});

test("preserves selected NGN, USD, and GBP codes on saved records", async () => {
  const { store, records } = createStore();
  await withServer(store, async (baseUrl) => {
    for (const [currency, key] of [
      ["NGN", "33333333-3333-4333-8333-333333333333"],
      ["USD", "44444444-4444-4444-8444-444444444444"],
      ["GBP", "55555555-5555-4555-8555-555555555555"],
    ]) {
      const response = await postRecord(
        baseUrl,
        standardInput({ currency, idempotencyKey: key }),
      );
      assert.equal(response.status, 201);
    }
    assert.deepEqual(
      records.map((record) => record.currency),
      ["NGN", "USD", "GBP"],
    );
  });
});

test("replays an identical idempotent save and rejects key reuse with different data", async () => {
  const { store, records } = createStore();
  await withServer(store, async (baseUrl) => {
    const original = standardInput();
    assert.equal((await postRecord(baseUrl, original)).status, 201);
    assert.equal((await postRecord(baseUrl, original)).status, 200);
    assert.equal(
      (
        await postRecord(
          baseUrl,
          standardInput({ name: "Different item" }),
        )
      ).status,
      409,
    );
    assert.equal(records.length, 1);

    const concurrentInput = standardInput({
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    });
    const concurrentResponses = await Promise.all([
      postRecord(baseUrl, concurrentInput),
      postRecord(baseUrl, concurrentInput),
    ]);
    assert.deepEqual(
      concurrentResponses.map(({ status }) => status).sort(),
      [200, 201],
    );
    assert.equal(records.length, 2);
  });
});

test("validates saved price inputs and selected business", async () => {
  const { store } = createStore();
  await withServer(store, async (baseUrl) => {
    assert.equal(
      (await postRecord(baseUrl, standardInput({ name: "   " }))).status,
      400,
    );
    assert.equal(
      (await postRecord(baseUrl, standardInput({ currency: "EUR" }))).status,
      400,
    );
    assert.equal(
      (
        await postRecord(
          baseUrl,
          standardInput(),
          "507f1f77bcf86cd799439013",
        )
      ).status,
      404,
    );
  });
});

test("rejects AI prices below cost or outside the recommendation range", async () => {
  const { store } = createStore();
  await withServer(store, async (baseUrl) => {
    const body = {
      ...standardInput(),
      calculationMethod: "ai",
      sellingPricePerUnit: 9,
      recommendationMetadata: {
        suggestedPrice: 12,
        minimumPrice: 10,
        maximumPrice: 15,
      },
    };
    assert.equal((await postRecord(baseUrl, body)).status, 400);
  });
});

test("lists only pricing records for the selected business", async () => {
  const { store } = createStore();
  await withServer(store, async (baseUrl) => {
    await postRecord(baseUrl, standardInput());
    const response = await fetch(
      `${baseUrl}/api/businesses/${businessId.toString()}/pricing-records`,
    );
    assert.equal(response.status, 200);
    const payload: unknown = await response.json();
    assert.ok(typeof payload === "object" && payload !== null);
    assert.ok("data" in payload && Array.isArray(payload.data));
    assert.equal(payload.data.length, 1);
    assert.equal(payload.data[0].name, "Handmade Tote Bag");

    const otherBusinessResponse = await fetch(
      `${baseUrl}/api/businesses/${otherBusinessId.toString()}/pricing-records`,
    );
    const otherBusinessPayload: unknown = await otherBusinessResponse.json();
    assert.equal(otherBusinessResponse.status, 200);
    assert.ok(
      typeof otherBusinessPayload === "object" &&
        otherBusinessPayload !== null &&
        "data" in otherBusinessPayload &&
        Array.isArray(otherBusinessPayload.data),
    );
    assert.equal(otherBusinessPayload.data.length, 0);
  });
});

test("updates stored fields without replacing record identity or recalculating", async () => {
  const { store, records } = createStore();
  await withServer(store, async (baseUrl) => {
    const created = await postRecord(baseUrl, standardInput());
    const createdData = responseData(created.payload);
    const recordId = String(createdData._id);
    const originalCreatedAt = createdData.createdAt;
    const originalUpdatedAt = createdData.updatedAt;

    const updated = await requestRecordAction(baseUrl, "PATCH", recordId, {
      name: "Updated Tote Bag",
      currency: "USD",
      unitCost: 20,
      sellingPricePerUnit: 29.5,
    });

    assert.equal(updated.status, 200);
    const updatedData = responseData(updated.payload);
    assert.equal(updatedData._id, recordId);
    assert.equal(updatedData.name, "Updated Tote Bag");
    assert.equal(updatedData.currency, "USD");
    assert.equal(updatedData.unitCost, 20);
    assert.equal(updatedData.sellingPricePerUnit, 29.5);
    assert.equal(updatedData.createdAt, originalCreatedAt);
    assert.notEqual(updatedData.updatedAt, originalUpdatedAt);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.calculationMethod, "standard");
  });
});

test("validates updated monetary amounts before persisting", async () => {
  const { store, records } = createStore();
  await withServer(store, async (baseUrl) => {
    const created = await postRecord(baseUrl, standardInput());
    const recordId = String(responseData(created.payload)._id);
    const invalidUpdate = await requestRecordAction(
      baseUrl,
      "PATCH",
      recordId,
      { sellingPricePerUnit: Number.MAX_VALUE },
    );

    assert.equal(invalidUpdate.status, 400);
    assert.equal(records[0]?.sellingPricePerUnit, 15);
  });
});

test("scopes update and deletion to the requested business and deletes only that record", async () => {
  const { store, records } = createStore();
  await withServer(store, async (baseUrl) => {
    const created = await postRecord(baseUrl, standardInput());
    const recordId = String(responseData(created.payload)._id);

    assert.equal(
      (
        await requestRecordAction(
          baseUrl,
          "PATCH",
          recordId,
          { name: "Cross-business edit" },
          otherBusinessId.toString(),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await requestRecordAction(
          baseUrl,
          "DELETE",
          recordId,
          undefined,
          otherBusinessId.toString(),
        )
      ).status,
      404,
    );
    assert.equal(records.length, 1);

    const deleted = await requestRecordAction(
      baseUrl,
      "DELETE",
      recordId,
    );
    assert.equal(deleted.status, 200);
    assert.equal(responseData(deleted.payload).id, recordId);
    assert.equal(records.length, 0);
  });
});

test("declares timestamp support and unique business-scoped idempotency", () => {
  assert.equal(PricingRecordModel.schema.options.timestamps, true);
  assert.ok(
    PricingRecordModel.schema.indexes().some(
      ([fields, options]) =>
        fields.businessId === 1 &&
        fields.idempotencyKey === 1 &&
        options?.unique === true,
    ),
  );
});
