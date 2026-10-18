import { z } from "zod";
import { pricingCalculationInputsSchema } from "./pricing.js";

const calculationSchema = pricingCalculationInputsSchema;
const maximumSafeMoney = Number.MAX_SAFE_INTEGER / 100;

const recordFields = {
  name: z.string().trim().min(1, "Product or service name is required.").max(200),
  type: z.enum(["product", "service"]),
  currency: z
    .string()
    .trim()
    .min(1, "Currency is required.")
    .max(12)
    .transform((value) => value.toUpperCase()),
  calculation: calculationSchema,
  idempotencyKey: z.uuid(),
};

const recommendationMetadataSchema = z
  .object({
    suggestedPrice: z.number().finite().positive(),
    minimumPrice: z.number().finite().positive(),
    maximumPrice: z.number().finite().positive(),
  })
  .strict()
  .refine(
    ({ suggestedPrice, minimumPrice, maximumPrice }) =>
      minimumPrice <= maximumPrice &&
      minimumPrice <= suggestedPrice &&
      suggestedPrice <= maximumPrice,
    {
      path: ["suggestedPrice"],
      message: "Suggested price must be within the recommendation range.",
    },
  );

export const createPricingRecordSchema = z.discriminatedUnion(
  "calculationMethod",
  [
    z
      .object({
        ...recordFields,
        calculationMethod: z.literal("standard"),
      })
      .strict(),
    z
      .object({
        ...recordFields,
        calculationMethod: z.literal("ai"),
        sellingPricePerUnit: z.number().finite().positive(),
        recommendationMetadata: recommendationMetadataSchema,
      })
      .strict(),
  ],
);

export const pricingRecordParamsSchema = z
  .object({
    businessId: z
      .string()
      .regex(/^[\da-f]{24}$/i, "A valid business ID is required."),
  })
  .strict();

export const pricingRecordIdParamsSchema = pricingRecordParamsSchema
  .extend({
    pricingRecordId: z
      .string()
      .regex(/^[\da-f]{24}$/i, "A valid pricing record ID is required."),
  })
  .strict();

const editablePricingRecordFields = {
  name: recordFields.name.optional(),
  type: recordFields.type.optional(),
  currency: recordFields.currency.optional(),
  unitCost: pricingCalculationInputsSchema.shape.unitCost
    .max(maximumSafeMoney)
    .optional(),
  additionalCosts:
    pricingCalculationInputsSchema.shape.additionalCosts
      .unwrap()
      .max(maximumSafeMoney)
      .optional(),
  markupPercent: pricingCalculationInputsSchema.shape.markupPercent.optional(),
  quantity: pricingCalculationInputsSchema.shape.quantity.unwrap().optional(),
  sellingPricePerUnit: z
    .number()
    .finite()
    .nonnegative()
    .max(maximumSafeMoney)
    .optional(),
};

export const updatePricingRecordSchema = z
  .object(editablePricingRecordFields)
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "At least one pricing record field must be supplied.",
  });
