import { z } from "zod";

const businessFields = {
  name: z.string().trim().min(1, "Name is required."),
  industry: z.string().trim().optional(),
  currency: z.string().trim().min(1).default("NGN"),
  description: z.string().trim().optional(),
};

export const createBusinessSchema = z.object(businessFields).strict();

export const updateBusinessSchema = z
  .object(businessFields)
  .partial()
  .strict()
  .refine((business) => Object.keys(business).length > 0, {
    message: "At least one field must be provided.",
  });

export const businessIdParamsSchema = z
  .object({
    id: z.string().regex(/^[\da-f]{24}$/i, "A valid business ID is required."),
  })
  .strict();

export const businessSummaryParamsSchema = z
  .object({
    businessId: z
      .string()
      .regex(/^[\da-f]{24}$/i, "A valid business ID is required."),
  })
  .strict();
