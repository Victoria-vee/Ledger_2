import { createHash } from "node:crypto";
import { Router, type Response } from "express";
import mongoose, { Types, type HydratedDocument } from "mongoose";
import { BusinessModel } from "../models/business.js";
import {
  PricingRecordModel,
  type PricingRecord,
} from "../models/pricingRecord.js";
import {
  createPricingRecordSchema,
  pricingRecordIdParamsSchema,
  pricingRecordParamsSchema,
  updatePricingRecordSchema,
} from "../schemas/pricingRecord.js";
import type { z } from "zod";
import {
  calculatePricing,
  PricingPrecisionError,
} from "../services/pricingCalculator.js";

export type PricingRecordDocument = HydratedDocument<PricingRecord>;
type PricingRecordUpdate = z.output<typeof updatePricingRecordSchema>;

export interface PricingRecordStore {
  findBusinessCurrency(businessId: Types.ObjectId): Promise<string | null>;
  findByIdempotencyKey(
    businessId: Types.ObjectId,
    idempotencyKey: string,
  ): Promise<PricingRecordDocument | null>;
  createRecord(
    record: Omit<PricingRecord, "createdAt" | "updatedAt">,
  ): Promise<PricingRecordDocument>;
  findBusinessRecords(
    businessId: Types.ObjectId,
  ): Promise<PricingRecordDocument[]>;
  updateRecord(
    businessId: Types.ObjectId,
    pricingRecordId: Types.ObjectId,
    changes: PricingRecordUpdate,
  ): Promise<PricingRecordDocument | null>;
  deleteRecord(
    businessId: Types.ObjectId,
    pricingRecordId: Types.ObjectId,
  ): Promise<boolean>;
}

const mongooseStore: PricingRecordStore = {
  async findBusinessCurrency(businessId) {
    const business = await BusinessModel.findById(businessId).select("currency");
    return business?.currency ?? null;
  },
  findByIdempotencyKey(businessId, idempotencyKey) {
    return PricingRecordModel.findOne({ businessId, idempotencyKey })
      .select("+requestFingerprint")
      .exec();
  },
  createRecord(record) {
    return PricingRecordModel.create(record);
  },
  findBusinessRecords(businessId) {
    return PricingRecordModel.find({ businessId })
      .sort({ createdAt: -1 })
      .exec();
  },
  updateRecord(businessId, pricingRecordId, changes) {
    return PricingRecordModel.findOneAndUpdate(
      { businessId, _id: pricingRecordId },
      { $set: changes },
      { returnDocument: "after", runValidators: true },
    ).exec();
  },
  async deleteRecord(businessId, pricingRecordId) {
    const result = await PricingRecordModel.deleteOne({
      businessId,
      _id: pricingRecordId,
    }).exec();
    return result.deletedCount === 1;
  },
};

const supportedCurrencies = new Set(["NGN", "USD", "GBP"]);
const maximumSafeMoney = Number.MAX_SAFE_INTEGER / 100;

function sendValidationError(
  response: Response,
  issues: Array<{ path: PropertyKey[]; message: string }>,
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

function sendBusinessNotFound(response: Response): void {
  response.status(404).json({
    success: false,
    error: {
      code: "BUSINESS_NOT_FOUND",
      message: "Business not found.",
    },
  });
}

function sendPricingRecordNotFound(response: Response): void {
  response.status(404).json({
    success: false,
    error: {
      code: "PRICING_RECORD_NOT_FOUND",
      message: "Saved pricing record not found for this business.",
    },
  });
}

function sendIdempotencyConflict(response: Response): void {
  response.status(409).json({
    success: false,
    error: {
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "This save key was already used for a different pricing record.",
    },
  });
}

function sendDatabaseError(response: Response): void {
  response.status(500).json({
    success: false,
    error: {
      code: "DATABASE_ERROR",
      message: "Unable to save or retrieve the pricing record.",
    },
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function logPricingRecordError(operation: string, error: unknown): void {
  console.error(`Pricing record ${operation} failed.`, {
    name: error instanceof Error ? error.name : "UnknownError",
    code:
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined,
  });
}

export function createBusinessPricingRecordsRouter(
  store: PricingRecordStore = mongooseStore,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (request, response) => {
    const parsedParams = pricingRecordParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      sendValidationError(response, parsedParams.error.issues);
      return;
    }

    try {
      const businessId = new Types.ObjectId(parsedParams.data.businessId);
      const businessCurrency = await store.findBusinessCurrency(businessId);
      if (!businessCurrency) {
        sendBusinessNotFound(response);
        return;
      }
      const records = await store.findBusinessRecords(businessId);
      response.json({ success: true, data: records });
    } catch (error) {
      logPricingRecordError("retrieval", error);
      sendDatabaseError(response);
    }
  });

  router.post("/", async (request, response) => {
    const parsedParams = pricingRecordParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      sendValidationError(response, parsedParams.error.issues);
      return;
    }

    const parsedBody = createPricingRecordSchema.safeParse(request.body);
    if (!parsedBody.success) {
      sendValidationError(response, parsedBody.error.issues);
      return;
    }

    try {
      const businessId = new Types.ObjectId(parsedParams.data.businessId);
      const businessCurrency = await store.findBusinessCurrency(businessId);
      if (!businessCurrency) {
        sendBusinessNotFound(response);
        return;
      }

      const currency = parsedBody.data.currency;
      if (
        !supportedCurrencies.has(currency) &&
        currency !== businessCurrency.trim().toUpperCase()
      ) {
        sendValidationError(response, [
          {
            path: ["currency"],
            message:
              "Choose NGN, USD, GBP, or the selected business currency.",
          },
        ]);
        return;
      }

      const calculation = calculatePricing(parsedBody.data.calculation);
      let sellingPricePerUnit = calculation.sellingPricePerUnit;
      if (parsedBody.data.calculationMethod === "ai") {
        const { recommendationMetadata, sellingPricePerUnit: requestedPrice } =
          parsedBody.data;
        const minimumPrice = Math.max(0.01, calculation.totalUnitCost);
        if (
          recommendationMetadata.minimumPrice < minimumPrice ||
          recommendationMetadata.suggestedPrice > maximumSafeMoney ||
          recommendationMetadata.minimumPrice > maximumSafeMoney ||
          recommendationMetadata.maximumPrice > maximumSafeMoney ||
          requestedPrice < recommendationMetadata.minimumPrice ||
          requestedPrice > recommendationMetadata.maximumPrice
        ) {
          sendValidationError(response, [
            {
              path: ["sellingPricePerUnit"],
              message:
                "The AI price must be within its validated range and cover the entered costs.",
            },
          ]);
          return;
        }

        const verifiedCalculation = calculatePricing({
          unitCost: calculation.totalUnitCost,
          additionalCosts: 0,
          markupPercent: calculation.markupPercent,
          quantity: parsedBody.data.calculation.quantity,
          alternativePrices: [requestedPrice],
        });
        const verifiedPrice = verifiedCalculation.alternatives[0];
        if (
          !verifiedPrice ||
          verifiedPrice.grossProfitPerUnit < 0 ||
          verifiedPrice.sellingPricePerUnit < minimumPrice
        ) {
          sendValidationError(response, [
            {
              path: ["sellingPricePerUnit"],
              message: "The AI price does not satisfy the calculation cost floor.",
            },
          ]);
          return;
        }
        sellingPricePerUnit = verifiedPrice.sellingPricePerUnit;
      }

      const { calculation: calculationInput } = parsedBody.data;
      const recordFields = {
        businessId,
        name: parsedBody.data.name,
        type: parsedBody.data.type,
        currency,
        unitCost: calculationInput.unitCost,
        additionalCosts: calculationInput.additionalCosts,
        markupPercent: calculationInput.markupPercent,
        quantity: calculationInput.quantity,
        sellingPricePerUnit,
        calculationMethod: parsedBody.data.calculationMethod,
        ...(parsedBody.data.calculationMethod === "ai"
          ? { recommendationMetadata: parsedBody.data.recommendationMetadata }
          : {}),
      };
      const requestFingerprint = fingerprint(recordFields);
      const idempotencyKey = parsedBody.data.idempotencyKey;

      const existing = await store.findByIdempotencyKey(
        businessId,
        idempotencyKey,
      );
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          sendIdempotencyConflict(response);
          return;
        }
        response.json({ success: true, data: existing });
        return;
      }

      try {
        const record = await store.createRecord({
          ...recordFields,
          idempotencyKey,
          requestFingerprint,
        });
        response.status(201).json({ success: true, data: record });
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        const duplicate = await store.findByIdempotencyKey(
          businessId,
          idempotencyKey,
        );
        if (!duplicate) {
          sendDatabaseError(response);
          return;
        }
        if (duplicate.requestFingerprint !== requestFingerprint) {
          sendIdempotencyConflict(response);
          return;
        }
        response.json({ success: true, data: duplicate });
      }
    } catch (error) {
      if (error instanceof mongoose.Error.ValidationError) {
        sendValidationError(
          response,
          Object.values(error.errors).map((issue) => ({
            path: [issue.path],
            message: issue.message,
          })),
        );
        return;
      }
      if (error instanceof PricingPrecisionError) {
        sendValidationError(response, [
          { path: ["calculation"], message: error.message },
        ]);
        return;
      }
      logPricingRecordError("persistence", error);
      sendDatabaseError(response);
    }
  });

  router.patch("/:pricingRecordId", async (request, response) => {
    const parsedParams = pricingRecordIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      sendValidationError(response, parsedParams.error.issues);
      return;
    }

    const parsedBody = updatePricingRecordSchema.safeParse(request.body);
    if (!parsedBody.success) {
      sendValidationError(response, parsedBody.error.issues);
      return;
    }

    try {
      const businessId = new Types.ObjectId(parsedParams.data.businessId);
      const pricingRecordId = new Types.ObjectId(
        parsedParams.data.pricingRecordId,
      );
      const businessCurrency = await store.findBusinessCurrency(businessId);
      if (!businessCurrency) {
        sendBusinessNotFound(response);
        return;
      }

      if (
        parsedBody.data.currency &&
        !supportedCurrencies.has(parsedBody.data.currency) &&
        parsedBody.data.currency !== businessCurrency.trim().toUpperCase()
      ) {
        sendValidationError(response, [
          {
            path: ["currency"],
            message:
              "Choose NGN, USD, GBP, or the selected business currency.",
          },
        ]);
        return;
      }

      const record = await store.updateRecord(
        businessId,
        pricingRecordId,
        parsedBody.data,
      );
      if (!record) {
        sendPricingRecordNotFound(response);
        return;
      }
      response.json({ success: true, data: record });
    } catch (error) {
      if (error instanceof mongoose.Error.ValidationError) {
        sendValidationError(
          response,
          Object.values(error.errors).map((issue) => ({
            path: [issue.path],
            message: issue.message,
          })),
        );
        return;
      }
      logPricingRecordError("update", error);
      sendDatabaseError(response);
    }
  });

  router.delete("/:pricingRecordId", async (request, response) => {
    const parsedParams = pricingRecordIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      sendValidationError(response, parsedParams.error.issues);
      return;
    }

    try {
      const businessId = new Types.ObjectId(parsedParams.data.businessId);
      const pricingRecordId = new Types.ObjectId(
        parsedParams.data.pricingRecordId,
      );
      const businessCurrency = await store.findBusinessCurrency(businessId);
      if (!businessCurrency) {
        sendBusinessNotFound(response);
        return;
      }

      const deleted = await store.deleteRecord(businessId, pricingRecordId);
      if (!deleted) {
        sendPricingRecordNotFound(response);
        return;
      }
      response.json({
        success: true,
        data: { id: pricingRecordId.toString() },
      });
    } catch (error) {
      logPricingRecordError("deletion", error);
      sendDatabaseError(response);
    }
  });

  return router;
}

export const businessPricingRecordsRouter =
  createBusinessPricingRecordsRouter();
