import { z } from "zod";

export const parseTransactionsRequestSchema = z
  .object({
    businessId: z
      .string()
      .regex(/^[\da-f]{24}$/i, "A valid business ID is required."),
    text: z
      .string()
      .trim()
      .min(1, "Transaction text is required.")
      .max(2000, "Transaction text must be 2000 characters or fewer."),
  })
  .strict();

const modelTransactionDraftSchema = z
  .object({
    type: z.enum(["income", "expense"]),
    typeEvidence: z.string().trim().max(200).nullable().optional(),
    description: z.string().trim().min(1).max(500),
    amount: z.number().finite().positive().nullable(),
    date: z.string().trim().min(1).max(100).nullable(),
    category: z.string().trim().min(1).max(100).optional(),
    amountEvidence: z.string().trim().max(200).nullable(),
    dateEvidence: z.string().trim().max(100).nullable(),
  })
  .strict();

const modelUncertaintySchema = z
  .object({
    draftIndex: z.number().int().nonnegative().nullable(),
    field: z.enum(["type", "amount", "date", "other"]),
    reason: z.string().trim().min(1).max(300),
  })
  .strict();

export const modelTransactionParseSchema = z
  .object({
    drafts: z.array(modelTransactionDraftSchema).max(20),
    uncertainties: z.array(modelUncertaintySchema).max(30),
  })
  .strict();

export type ModelTransactionParse = z.infer<
  typeof modelTransactionParseSchema
>;

export const modelTransactionParseJsonSchema = z.toJSONSchema(
  modelTransactionParseSchema,
);
