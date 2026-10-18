import { Schema, model } from "mongoose";

export interface Business {
  name: string;
  industry?: string;
  currency: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const businessSchema = new Schema<Business>(
  {
    name: { type: String, required: true, trim: true },
    industry: { type: String, trim: true },
    currency: { type: String, required: true, default: "NGN", trim: true },
    description: { type: String, trim: true },
  },
  { timestamps: true, strict: true },
);

export const BusinessModel = model<Business>("Business", businessSchema);
