import { Schema, Types, model } from "mongoose";

export type PricingRecordType = "product" | "service";
export type PricingCalculationMethod = "standard" | "ai";

export interface PricingRecommendationMetadata {
  suggestedPrice: number;
  minimumPrice: number;
  maximumPrice: number;
}

export interface PricingRecord {
  businessId: Types.ObjectId;
  name: string;
  type: PricingRecordType;
  currency: string;
  unitCost: number;
  additionalCosts: number;
  markupPercent: number;
  quantity: number;
  sellingPricePerUnit: number;
  calculationMethod: PricingCalculationMethod;
  recommendationMetadata?: PricingRecommendationMetadata;
  idempotencyKey: string;
  requestFingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

const pricingRecordSchema = new Schema<PricingRecord>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, required: true, enum: ["product", "service"] },
    currency: { type: String, required: true, trim: true, uppercase: true },
    unitCost: { type: Number, required: true, min: 0 },
    additionalCosts: { type: Number, required: true, min: 0 },
    markupPercent: { type: Number, required: true, min: 0 },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
    },
    sellingPricePerUnit: { type: Number, required: true, min: 0 },
    calculationMethod: {
      type: String,
      required: true,
      enum: ["standard", "ai"],
    },
    recommendationMetadata: {
      suggestedPrice: { type: Number, min: Number.MIN_VALUE },
      minimumPrice: { type: Number, min: Number.MIN_VALUE },
      maximumPrice: { type: Number, min: Number.MIN_VALUE },
    },
    idempotencyKey: { type: String, required: true, trim: true },
    requestFingerprint: { type: String, required: true, select: false },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: {
      transform(_document, result) {
        return Object.fromEntries(
          Object.entries(result).filter(
            ([key]) => key !== "requestFingerprint" && key !== "__v",
          ),
        );
      },
    },
  },
);

pricingRecordSchema.index(
  { businessId: 1, idempotencyKey: 1 },
  { unique: true },
);
pricingRecordSchema.index({ businessId: 1, createdAt: -1 });

export const PricingRecordModel = model<PricingRecord>(
  "PricingRecord",
  pricingRecordSchema,
);
