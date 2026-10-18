import { Router } from "express";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { BusinessModel } from "../models/business.js";
import { parseTransactionsRequestSchema } from "../schemas/ai.js";
import { normalizeTransactionDrafts } from "../services/ai/normalizeTransactionDrafts.js";
import { OpenAiTransactionParser } from "../services/ai/openaiTransactionParser.js";
import { createOpenAiClient } from "../services/ai/openaiClient.js";
import {
  AiProviderUnavailableError,
  InvalidAiModelOutputError,
} from "../services/ai/transactionParser.js";

export const aiRouter = Router();

const transactionParser = new OpenAiTransactionParser(
  createOpenAiClient(env.OPENAI_API_KEY),
  env.OPENAI_MODEL,
);

aiRouter.post("/parse-transactions", async (request, response) => {
  const parsedRequest = parseTransactionsRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: parsedRequest.error.issues.map((issue) => ({
          field: issue.path.map(String).join(".") || "body",
          message: issue.message,
        })),
      },
    });
    return;
  }

  try {
    const businessId = new mongoose.Types.ObjectId(
      parsedRequest.data.businessId,
    );
    const businessExists = await BusinessModel.exists({ _id: businessId });
    if (!businessExists) {
      response.status(404).json({
        success: false,
        error: {
          code: "BUSINESS_NOT_FOUND",
          message: "Business not found.",
        },
      });
      return;
    }

    const referenceDate = new Date().toISOString().slice(0, 10);
    const modelOutput = await transactionParser.parseTransactions(
      parsedRequest.data.text,
      referenceDate,
    );
    const result = normalizeTransactionDrafts(
      modelOutput,
      parsedRequest.data.text,
      referenceDate,
    );
    response.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AiProviderUnavailableError) {
      response.status(503).json({
        success: false,
        error: {
          code: "AI_PROVIDER_UNAVAILABLE",
          message:
            "The AI service is unavailable. Check the server's OpenAI configuration and try again.",
        },
      });
      return;
    }

    if (error instanceof InvalidAiModelOutputError) {
      response.status(502).json({
        success: false,
        error: {
          code: "INVALID_AI_OUTPUT",
          message:
            "The AI model returned an invalid draft. Try clarifying the transaction details.",
        },
      });
      return;
    }

    response.status(500).json({
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Unable to complete the transaction parsing request.",
      },
    });
  }
});
