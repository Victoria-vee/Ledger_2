import { Router, type Response } from "express";
import mongoose from "mongoose";
import { BusinessModel } from "../models/business.js";
import { TransactionModel } from "../models/transaction.js";
import {
  businessTransactionParamsSchema,
  createTransactionSchema,
  transactionIdParamsSchema,
  updateTransactionSchema,
} from "../schemas/transaction.js";

export const businessTransactionsRouter = Router({ mergeParams: true });
export const transactionsRouter = Router();

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

function sendTransactionNotFound(response: Response): void {
  response.status(404).json({
    success: false,
    error: {
      code: "TRANSACTION_NOT_FOUND",
      message: "Transaction not found.",
    },
  });
}

function sendDatabaseError(response: Response): void {
  response.status(500).json({
    success: false,
    error: {
      code: "DATABASE_ERROR",
      message: "Unable to complete the transaction request.",
    },
  });
}

function sendMongooseValidationError(
  response: Response,
  error: mongoose.Error.ValidationError,
): void {
  sendValidationError(
    response,
    Object.values(error.errors).map((issue) => ({
      path: [issue.path],
      message: issue.message,
    })),
  );
}

businessTransactionsRouter.post("/", async (request, response) => {
  const parsedParams = businessTransactionParamsSchema.safeParse(
    request.params,
  );
  if (!parsedParams.success) {
    sendValidationError(response, parsedParams.error.issues);
    return;
  }

  const parsedBody = createTransactionSchema.safeParse(request.body);
  if (!parsedBody.success) {
    sendValidationError(response, parsedBody.error.issues);
    return;
  }

  try {
    const businessId = new mongoose.Types.ObjectId(
      parsedParams.data.businessId,
    );
    const business = await BusinessModel.findById(businessId).select("currency");
    if (!business) {
      sendBusinessNotFound(response);
      return;
    }

    const transaction = await TransactionModel.create({
      ...parsedBody.data,
      currency:
        parsedBody.data.currency ??
        (business.currency?.trim().toUpperCase() || "NGN"),
      businessId,
    });
    response.status(201).json({ success: true, data: transaction });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      sendMongooseValidationError(response, error);
      return;
    }
    sendDatabaseError(response);
  }
});

businessTransactionsRouter.get("/", async (request, response) => {
  const parsedParams = businessTransactionParamsSchema.safeParse(
    request.params,
  );
  if (!parsedParams.success) {
    sendValidationError(response, parsedParams.error.issues);
    return;
  }

  try {
    const businessId = new mongoose.Types.ObjectId(
      parsedParams.data.businessId,
    );
    const businessExists = await BusinessModel.exists({ _id: businessId });
    if (!businessExists) {
      sendBusinessNotFound(response);
      return;
    }

    const transactions = await TransactionModel.find({ businessId }).sort({
      date: -1,
      createdAt: -1,
    });
    response.json({ success: true, data: transactions });
  } catch {
    sendDatabaseError(response);
  }
});

transactionsRouter.get("/:id", async (request, response) => {
  const parsedParams = transactionIdParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    sendValidationError(response, parsedParams.error.issues);
    return;
  }

  try {
    const id = new mongoose.Types.ObjectId(parsedParams.data.id);
    const transaction = await TransactionModel.findById(id);
    if (!transaction) {
      sendTransactionNotFound(response);
      return;
    }
    response.json({ success: true, data: transaction });
  } catch {
    sendDatabaseError(response);
  }
});

transactionsRouter.patch("/:id", async (request, response) => {
  const parsedParams = transactionIdParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    sendValidationError(response, parsedParams.error.issues);
    return;
  }

  const parsedBody = updateTransactionSchema.safeParse(request.body);
  if (!parsedBody.success) {
    sendValidationError(response, parsedBody.error.issues);
    return;
  }

  try {
    const id = new mongoose.Types.ObjectId(parsedParams.data.id);
    const transaction = await TransactionModel.findByIdAndUpdate(
      id,
      { $set: parsedBody.data },
      { returnDocument: "after", runValidators: true },
    );
    if (!transaction) {
      sendTransactionNotFound(response);
      return;
    }
    response.json({ success: true, data: transaction });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      sendMongooseValidationError(response, error);
      return;
    }
    sendDatabaseError(response);
  }
});

transactionsRouter.delete("/:id", async (request, response) => {
  const parsedParams = transactionIdParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    sendValidationError(response, parsedParams.error.issues);
    return;
  }

  try {
    const id = new mongoose.Types.ObjectId(parsedParams.data.id);
    const transaction = await TransactionModel.findByIdAndDelete(id);
    if (!transaction) {
      sendTransactionNotFound(response);
      return;
    }
    response.json({ success: true, data: { id: transaction.id } });
  } catch {
    sendDatabaseError(response);
  }
});
