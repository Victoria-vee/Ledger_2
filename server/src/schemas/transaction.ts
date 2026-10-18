import { z } from "zod";

const transactionFields = {
  type: z.enum(["income", "expense"]),
  description: z.string().trim().min(1, "Description is required."),
  amount: z.number().finite().positive("Amount must be greater than zero."),
  currency: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()).optional(),
  date: z
    .union([z.iso.datetime({ offset: true }), z.iso.date()])
    .transform((value) => new Date(value)),
  category: z.string().trim().optional(),
};

export const createTransactionSchema = z
  .object(transactionFields)
  .partial({ date: true })
  .strict();

export const updateTransactionSchema = z
  .object(transactionFields)
  .partial()
  .strict()
  .refine((transaction) => Object.keys(transaction).length > 0, {
    message: "At least one field must be provided.",
  });

export const transactionIdParamsSchema = z
  .object({
    id: z
      .string()
      .regex(/^[\da-f]{24}$/i, "A valid transaction ID is required."),
  })
  .strict();

export const businessTransactionParamsSchema = z
  .object({
    businessId: z
      .string()
      .regex(/^[\da-f]{24}$/i, "A valid business ID is required."),
  })
  .strict();
