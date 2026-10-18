import { z } from "zod";

export const pricingCalculationInputsSchema = z
  .object({
    unitCost: z.number().finite().nonnegative(),
    additionalCosts: z.number().finite().nonnegative().default(0),
    markupPercent: z.number().finite().nonnegative(),
    quantity: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .default(1),
  })
  .strict();

export const calculatePricingSchema = pricingCalculationInputsSchema
  .extend({
    targetMarginPercent: z.number().finite().nonnegative().lt(100).optional(),
    alternativePrices: z
      .array(z.number().finite().nonnegative())
      .max(5, "At most 5 alternative prices may be compared.")
      .optional(),
  })
  .refine(
    (input) =>
      input.targetMarginPercent === undefined ||
      input.unitCost + input.additionalCosts > 0,
    {
      path: ["targetMarginPercent"],
      message: "A target profit margin requires a positive total unit cost.",
    },
  );
