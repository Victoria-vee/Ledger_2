import { Schema, Types, model } from "mongoose";

export type TransactionType = "income" | "expense";

export interface Transaction {
  businessId: Types.ObjectId;
  type: TransactionType;
  description: string;
  amount: number;
  currency?: string;
  date: Date;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<Transaction>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    type: { type: String, required: true, enum: ["income", "expense"] },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: Number.MIN_VALUE },
    currency: { type: String, trim: true },
    date: { type: Date, required: true, default: Date.now },
    category: { type: String, trim: true },
  },
  { timestamps: true, strict: true },
);

export const TransactionModel = model<Transaction>(
  "Transaction",
  transactionSchema,
);
