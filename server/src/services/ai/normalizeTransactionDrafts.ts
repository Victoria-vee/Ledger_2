import {
  modelTransactionParseSchema,
  type ModelTransactionParse,
} from "../../schemas/ai.js";
import { InvalidAiModelOutputError } from "./transactionParser.js";

export interface TransactionDraft {
  type: "income" | "expense";
  description: string;
  amount: number | null;
  date: string | null;
  category?: string;
}

export interface TransactionDraftUncertainty {
  draftIndex: number | null;
  field: "type" | "amount" | "date" | "other";
  reason: string;
}

export interface TransactionDraftResponse {
  drafts: TransactionDraft[];
  uncertainties: TransactionDraftUncertainty[];
  requiresReview: true;
}

type TransactionType = TransactionDraft["type"];

function hasExactQuote(text: string, quote: string | null): quote is string {
  return (
    quote !== null &&
    text.toLocaleLowerCase().includes(quote.toLocaleLowerCase())
  );
}

function inferTransactionType(text: string): TransactionType | null {
  const hasExpenseCue =
    /\b(?:bought|purchased|spent|expense|expenses)\b/i.test(text);
  const hasIncomeCue =
    /\b(?:sold|earned|received\s+(?:a\s+)?payment|income|revenue)\b/i.test(
      text,
    );

  if (hasExpenseCue === hasIncomeCue) {
    return null;
  }
  return hasExpenseCue ? "expense" : "income";
}

function getNumericTokens(text: string): number[] {
  const matches = text.match(
    /(?<![\p{L}\p{N}])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\p{L}\p{N}])/gu,
  );
  return (matches ?? []).map((match) => Number(match.replaceAll(",", "")));
}

function isGroundedAmount(
  text: string,
  amountEvidence: string | null,
  amount: number,
): boolean {
  if (!hasExactQuote(text, amountEvidence)) {
    return false;
  }
  const tokens = getNumericTokens(amountEvidence);
  return tokens.length === 1 && tokens[0] === amount;
}

function dateFromEvidence(
  dateEvidence: string | null,
  text: string,
  referenceDate: string,
): string | null {
  if (!hasExactQuote(text, dateEvidence)) {
    return null;
  }

  const isoDate = dateEvidence.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (isoDate) {
    const parsed = new Date(`${isoDate}T00:00:00.000Z`);
    if (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === isoDate
    ) {
      return isoDate;
    }
  }

  const normalizedEvidence = dateEvidence.toLocaleLowerCase();
  if (/\btoday\b/.test(normalizedEvidence)) {
    return referenceDate;
  }
  if (/\byesterday\b/.test(normalizedEvidence)) {
    const yesterday = new Date(`${referenceDate}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return yesterday.toISOString().slice(0, 10);
  }

  return null;
}

function dateMatchesEvidence(
  modelDate: string | null,
  evidenceDate: string | null,
  referenceDate: string,
): boolean {
  if (modelDate === null || evidenceDate === null) {
    return false;
  }
  const normalizedModelDate = modelDate.toLocaleLowerCase();
  if (normalizedModelDate === evidenceDate) {
    return true;
  }
  if (normalizedModelDate === "today") {
    return evidenceDate === referenceDate;
  }
  if (normalizedModelDate === "yesterday") {
    const yesterday = new Date(`${referenceDate}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return evidenceDate === yesterday.toISOString().slice(0, 10);
  }
  return false;
}

function validateOutput(rawOutput: unknown): ModelTransactionParse {
  const parsed = modelTransactionParseSchema.safeParse(rawOutput);
  if (!parsed.success) {
    throw new InvalidAiModelOutputError();
  }
  return parsed.data;
}

export function normalizeTransactionDrafts(
  rawOutput: unknown,
  text: string,
  referenceDate: string,
): TransactionDraftResponse {
  const parsed = validateOutput(rawOutput);
  const drafts: TransactionDraft[] = [];
  const uncertainties: TransactionDraftUncertainty[] = [];
  const textType = inferTransactionType(text);

  function addUncertainty(
    draftIndex: number | null,
    field: TransactionDraftUncertainty["field"],
    reason: string,
  ): void {
    if (
      uncertainties.some(
        (uncertainty) =>
          uncertainty.draftIndex === draftIndex && uncertainty.field === field,
      )
    ) {
      return;
    }
    uncertainties.push({ draftIndex, field, reason });
  }

  for (const uncertainty of parsed.uncertainties) {
    if (
      uncertainty.draftIndex === null ||
      uncertainty.draftIndex >= parsed.drafts.length
    ) {
      if (uncertainty.field === "type" && textType !== null) {
        continue;
      }
      addUncertainty(null, uncertainty.field, uncertainty.reason);
    }
  }

  parsed.drafts.forEach((draft, sourceIndex) => {
    const sourceUncertainties = parsed.uncertainties.filter(
      (uncertainty) => uncertainty.draftIndex === sourceIndex,
    );
    const typeUncertainty = sourceUncertainties.find(
      (uncertainty) => uncertainty.field === "type",
    );
    const evidenceType =
      draft.typeEvidence && hasExactQuote(text, draft.typeEvidence)
        ? inferTransactionType(draft.typeEvidence)
        : null;
    const resolvedType = evidenceType ?? textType;
    if (typeUncertainty && resolvedType === null) {
      addUncertainty(null, "type", typeUncertainty.reason);
      return;
    }

    const draftIndex = drafts.length;
    const amountUncertainty = sourceUncertainties.find(
      (uncertainty) => uncertainty.field === "amount",
    );
    let amount = draft.amount;
    if (
      amountUncertainty ||
      amount === null ||
      !isGroundedAmount(text, draft.amountEvidence, amount)
    ) {
      amount = null;
      addUncertainty(
        draftIndex,
        "amount",
        amountUncertainty?.reason ??
          "The transaction amount could not be verified from a clear amount in the text.",
      );
    }

    const dateUncertainty = sourceUncertainties.find(
      (uncertainty) => uncertainty.field === "date",
    );
    const evidenceDate = dateFromEvidence(
      draft.dateEvidence,
      text,
      referenceDate,
    );
    const date = dateUncertainty ||
      !dateMatchesEvidence(draft.date, evidenceDate, referenceDate)
        ? null
        : evidenceDate;
    if (date === null) {
      addUncertainty(
        draftIndex,
        "date",
        dateUncertainty?.reason ??
          "The transaction date could not be verified as an explicit or unambiguous date.",
      );
    }

    for (const uncertainty of sourceUncertainties) {
      if (uncertainty.field === "other") {
        addUncertainty(draftIndex, "other", uncertainty.reason);
      }
    }

    drafts.push({
      type: resolvedType ?? draft.type,
      description: draft.description,
      amount,
      date,
      ...(draft.category ? { category: draft.category } : {}),
    });
  });

  if (drafts.length === 0 && uncertainties.length === 0) {
    addUncertainty(
      null,
      "other",
      "No transaction could be confidently identified from the supplied text.",
    );
  }

  return { drafts, uncertainties, requiresReview: true };
}
