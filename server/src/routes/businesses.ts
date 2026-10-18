import { Router, type Request, type Response } from "express";
import mongoose from "mongoose";
import { BusinessModel } from "../models/business.js";
import { TransactionModel } from "../models/transaction.js";
import {
  businessIdParamsSchema,
  businessSummaryParamsSchema,
  createBusinessSchema,
  updateBusinessSchema,
} from "../schemas/business.js";

export const businessRouter = Router();

interface CurrencyBusinessSummary {
  currency: string;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  incomeCount: number;
  expenseCount: number;
  transactionCount: number;
}

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

function sendNotFound(response: Response): void {
  response.status(404).json({
    success: false,
    error: {
      code: "BUSINESS_NOT_FOUND",
      message: "Business not found.",
    },
  });
}

function sendDatabaseError(
  response: Response,
): void {
  response.status(500).json({
    success: false,
    error: {
      code: "DATABASE_ERROR",
      message: "Unable to complete the business request.",
    },
  });
}

async function updateBusiness(request: Request, response: Response): Promise<void> {
  const parsedParams = businessIdParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    sendValidationError(response, parsedParams.error.issues);
    return;
  }

  const parsedBody = updateBusinessSchema.safeParse(request.body);
  if (!parsedBody.success) {
    sendValidationError(response, parsedBody.error.issues);
    return;
  }

  try {
    const id = new mongoose.Types.ObjectId(parsedParams.data.id);
    const business = await BusinessModel.findByIdAndUpdate(
      id,
      { $set: parsedBody.data },
      { new: true, runValidators: true },
    );
    if (!business) {
      sendNotFound(response);
      return;
    }
    response.json({ success: true, data: business });
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
    sendDatabaseError(response);
  }
}

businessRouter.get("/", async (_request, response) => {
  try {
    const businesses = await BusinessModel.find().sort({ createdAt: -1 });
    response.json({ success: true, data: businesses });
  } catch {
    sendDatabaseError(response);
  }
});

businessRouter.post("/", async (request, response) => {
  const parsed = createBusinessSchema.safeParse(request.body);
  if (!parsed.success) {
    sendValidationError(response, parsed.error.issues);
    return;
  }

  try {
    const business = await BusinessModel.create(parsed.data);
    response.status(201).json({ success: true, data: business });
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
    sendDatabaseError(response);
  }
});

businessRouter.get("/:id", async (request, response) => {
  const parsedParams = businessIdParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    sendValidationError(response, parsedParams.error.issues);
    return;
  }

  try {
    const id = new mongoose.Types.ObjectId(parsedParams.data.id);
    const business = await BusinessModel.findById(id);
    if (!business) {
      sendNotFound(response);
      return;
    }
    response.json({ success: true, data: business });
  } catch {
    sendDatabaseError(response);
  }
});

businessRouter.get("/:businessId/summary", async (request, response) => {
  const parsedParams = businessSummaryParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    sendValidationError(response, parsedParams.error.issues);
    return;
  }

  try {
    const businessId = new mongoose.Types.ObjectId(
      parsedParams.data.businessId,
    );
    const business = await BusinessModel.findById(businessId).select("currency");
    if (!business) {
      sendNotFound(response);
      return;
    }

    const currencySummaries = await TransactionModel.aggregate<
      Omit<CurrencyBusinessSummary, "currency"> & { _id: string }
    >([
      { $match: { businessId } },
      {
        $set: {
          currency: {
            $let: {
              vars: {
                transactionCurrency: {
                  $trim: { input: { $ifNull: ["$currency", ""] } },
                },
              },
              in: {
                $toUpper: {
                  $cond: [
                    { $eq: ["$$transactionCurrency", ""] },
                    business.currency?.trim() || "NGN",
                    "$$transactionCurrency",
                  ],
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: "$currency",
          totalIncome: {
            $sum: {
              $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
            },
          },
          totalExpenses: {
            $sum: {
              $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
            },
          },
          netBalance: {
            $sum: {
              $cond: [
                { $eq: ["$type", "income"] },
                "$amount",
                { $multiply: ["$amount", -1] },
              ],
            },
          },
          incomeCount: {
            $sum: { $cond: [{ $eq: ["$type", "income"] }, 1, 0] },
          },
          expenseCount: {
            $sum: { $cond: [{ $eq: ["$type", "expense"] }, 1, 0] },
          },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();

    const currencies: CurrencyBusinessSummary[] = currencySummaries.map(
      ({ _id, ...summary }) => ({ currency: _id, ...summary }),
    );
    const summary = {
      currencies,
      transactionCount: currencies.reduce(
        (total, currency) => total + currency.transactionCount,
        0,
      ),
    };

    response.json({ success: true, data: summary });
  } catch {
    sendDatabaseError(response);
  }
});

businessRouter.patch("/:id", updateBusiness);
businessRouter.put("/:id", updateBusiness);

businessRouter.delete("/:id", async (request, response) => {
  const parsedParams = businessIdParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    sendValidationError(response, parsedParams.error.issues);
    return;
  }

  try {
    const id = new mongoose.Types.ObjectId(parsedParams.data.id);
    const business = await BusinessModel.findByIdAndDelete(id);
    if (!business) {
      sendNotFound(response);
      return;
    }
    response.json({ success: true, data: { id: business.id } });
  } catch {
    sendDatabaseError(response);
  }
});
