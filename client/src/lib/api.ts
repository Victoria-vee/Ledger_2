import type {
  Business,
  BusinessSummary,
  HealthResponse,
  ParseTransactionsResult,
  PricingCalculationInput,
  CreatePricingRecordInput,
  PricingRecord,
  PricingRecommendationContext,
  PricingRecommendationResponse,
  PricingResult,
  Transaction,
  TransactionType,
  UpdatePricingRecordInput,
} from "./types";

type DataGuard<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOptionalStrings(
  record: Record<string, unknown>,
  keys: string[],
): boolean {
  return keys.every((key) => record[key] === undefined || typeof record[key] === "string");
}

function isBusiness(value: unknown): value is Business {
  return (
    isRecord(value) &&
    typeof value._id === "string" &&
    typeof value.name === "string" &&
    typeof value.currency === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    hasOptionalStrings(value, ["industry", "description"])
  );
}

function isBusinesses(value: unknown): value is Business[] {
  return Array.isArray(value) && value.every(isBusiness);
}

function isTransaction(value: unknown): value is Transaction {
  return (
    isRecord(value) &&
    typeof value._id === "string" &&
    typeof value.businessId === "string" &&
    (value.type === "income" || value.type === "expense") &&
    typeof value.description === "string" &&
    typeof value.amount === "number" &&
    (value.currency === undefined || typeof value.currency === "string") &&
    typeof value.date === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    hasOptionalStrings(value, ["category"])
  );
}

function isTransactions(value: unknown): value is Transaction[] {
  return Array.isArray(value) && value.every(isTransaction);
}

function isDeletedTransaction(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === "string";
}

function isDeletedPricingRecord(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === "string";
}

function isBusinessSummary(value: unknown): value is BusinessSummary {
  return (
    isRecord(value) &&
    Array.isArray(value.currencies) &&
    value.currencies.every(
      (currency) =>
        isRecord(currency) &&
        typeof currency.currency === "string" &&
        typeof currency.totalIncome === "number" &&
        typeof currency.totalExpenses === "number" &&
        typeof currency.netBalance === "number" &&
        typeof currency.incomeCount === "number" &&
        typeof currency.expenseCount === "number" &&
        typeof currency.transactionCount === "number",
    ) &&
    typeof value.transactionCount === "number"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPricingResult(value: unknown): value is PricingResult {
  const isMarginPercent = (percent: unknown): percent is number | null =>
    percent === null || isFiniteNumber(percent);
  return (
    isRecord(value) &&
    isFiniteNumber(value.unitCost) &&
    isFiniteNumber(value.additionalCosts) &&
    isFiniteNumber(value.totalUnitCost) &&
    isFiniteNumber(value.markupPercent) &&
    isFiniteNumber(value.sellingPricePerUnit) &&
    isFiniteNumber(value.profitPerUnit) &&
    isFiniteNumber(value.grossProfitPerUnit) &&
    isMarginPercent(value.grossProfitMarginPercent) &&
    isFiniteNumber(value.totalRevenue) &&
    isFiniteNumber(value.totalProfit) &&
    (value.targetMargin === null ||
    (isRecord(value.targetMargin) &&
      isFiniteNumber(value.targetMargin.targetMarginPercent) &&
      isFiniteNumber(value.targetMargin.sellingPricePerUnit) &&
      isFiniteNumber(value.targetMargin.grossProfitPerUnit) &&
      isMarginPercent(value.targetMargin.grossProfitMarginPercent))) &&
    Array.isArray(value.alternatives) &&
    value.alternatives.every(
      (alternative) =>
        isRecord(alternative) &&
        isFiniteNumber(alternative.sellingPricePerUnit) &&
        isFiniteNumber(alternative.grossProfitPerUnit) &&
        isFiniteNumber(alternative.projectedGrossProfit) &&
        isMarginPercent(alternative.grossProfitMarginPercent),
    )
  );
}

function isPricingRecord(value: unknown): value is PricingRecord {
  return (
    isRecord(value) &&
    typeof value._id === "string" &&
    typeof value.businessId === "string" &&
    typeof value.name === "string" &&
    (value.type === "product" || value.type === "service") &&
    typeof value.currency === "string" &&
    isFiniteNumber(value.unitCost) &&
    isFiniteNumber(value.additionalCosts) &&
    isFiniteNumber(value.markupPercent) &&
    isFiniteNumber(value.quantity) &&
    isFiniteNumber(value.sellingPricePerUnit) &&
    (value.calculationMethod === "standard" ||
      value.calculationMethod === "ai") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.recommendationMetadata === undefined ||
      (isRecord(value.recommendationMetadata) &&
        isFiniteNumber(value.recommendationMetadata.suggestedPrice) &&
        isFiniteNumber(value.recommendationMetadata.minimumPrice) &&
        isFiniteNumber(value.recommendationMetadata.maximumPrice)))
  );
}

function isPricingRecords(value: unknown): value is PricingRecord[] {
  return Array.isArray(value) && value.every(isPricingRecord);
}

function isVerifiedPrice(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.price) &&
    isFiniteNumber(value.grossProfitPerUnit) &&
    isFiniteNumber(value.projectedGrossProfit) &&
    (value.grossProfitMarginPercent === null ||
      isFiniteNumber(value.grossProfitMarginPercent))
  );
}

function isPricingRecommendationResponse(
  value: unknown,
): value is PricingRecommendationResponse {
  if (!isRecord(value) || !isPricingResult(value.calculation)) {
    return false;
  }
  const recommendation = value.recommendation;
  return (
    isRecord(recommendation) &&
    isVerifiedPrice(recommendation.suggestedPrice) &&
    isRecord(recommendation.priceRange) &&
    isVerifiedPrice(recommendation.priceRange.minimum) &&
    isVerifiedPrice(recommendation.priceRange.maximum) &&
    typeof recommendation.explanation === "string" &&
    Array.isArray(recommendation.assumptions) &&
    recommendation.assumptions.every((item) => typeof item === "string") &&
    Array.isArray(recommendation.missingInformation) &&
    recommendation.missingInformation.every((item) => typeof item === "string") &&
    typeof recommendation.affordabilityVsProfit === "string" &&
    Array.isArray(recommendation.scenarios) &&
    recommendation.scenarios.every(
      (scenario) =>
        isRecord(scenario) &&
        (scenario.level === "conservative" ||
          scenario.level === "balanced" ||
          scenario.level === "higher-margin") &&
        typeof scenario.rationale === "string" &&
        isVerifiedPrice(scenario.result),
    ) &&
    typeof recommendation.marketEvidenceProvided === "boolean" &&
    typeof recommendation.marketValidationNote === "string"
  );
}

function isParseTransactionsResult(value: unknown): value is ParseTransactionsResult {
  return (
    isRecord(value) &&
    value.requiresReview === true &&
    Array.isArray(value.drafts) &&
    value.drafts.every(
      (draft) =>
        isRecord(draft) &&
        (draft.type === "income" || draft.type === "expense") &&
        typeof draft.description === "string" &&
        (typeof draft.amount === "number" || draft.amount === null) &&
        (typeof draft.date === "string" || draft.date === null) &&
        hasOptionalStrings(draft, ["category"]),
    ) &&
    Array.isArray(value.uncertainties) &&
    value.uncertainties.every(
      (uncertainty) =>
        isRecord(uncertainty) &&
        (typeof uncertainty.draftIndex === "number" || uncertainty.draftIndex === null) &&
        (uncertainty.field === "type" ||
          uncertainty.field === "amount" ||
          uncertainty.field === "date" ||
          uncertainty.field === "other") &&
        typeof uncertainty.reason === "string",
    )
  );
}

async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an unreadable response."
        : `The request failed with status ${response.status}.`,
    );
  }

  if (!response.ok) {
    if (
      typeof payload === "object" &&
      payload !== null &&
      "success" in payload &&
      payload.success === false &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
    ) {
      throw new Error(payload.error.message);
    }
    throw new Error(`The request failed with status ${response.status}.`);
  }

  return payload;
}

async function requestData<T>(
  path: string,
  isData: DataGuard<T>,
  options?: RequestInit,
): Promise<T> {
  const payload = await request(path, options);
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("success" in payload) ||
    payload.success !== true ||
    !("data" in payload)
  ) {
    throw new Error("The server returned an invalid response.");
  }
  if (!isData(payload.data)) {
    throw new Error("The server returned data that does not match the expected format.");
  }
  return payload.data;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("status" in payload) ||
    (payload.status !== "ok" && payload.status !== "unhealthy") ||
    !("application" in payload) ||
    payload.application !== "ok" ||
    !("database" in payload) ||
    (payload.database !== "connected" &&
      payload.database !== "connecting" &&
      payload.database !== "disconnecting" &&
      payload.database !== "disconnected")
  ) {
    throw new Error("The server returned an invalid health response.");
  }
  return payload as HealthResponse;
}

export function getBusinesses(): Promise<Business[]> {
  return requestData("/api/businesses", isBusinesses);
}

export function createBusiness(business: {
  name: string;
  industry?: string;
  currency: string;
  description?: string;
}): Promise<Business> {
  return requestData(
    "/api/businesses",
    isBusiness,
    {
      method: "POST",
      body: JSON.stringify(business),
    },
  );
}

export function getBusinessSummary(businessId: string): Promise<BusinessSummary> {
  return requestData(
    `/api/businesses/${encodeURIComponent(businessId)}/summary`,
    isBusinessSummary,
  );
}

export function getTransactions(businessId: string): Promise<Transaction[]> {
  return requestData(
    `/api/businesses/${encodeURIComponent(businessId)}/transactions`,
    isTransactions,
  );
}

export function createTransaction(
  businessId: string,
  transaction: {
    type: TransactionType;
    description: string;
    amount: number;
    currency?: string;
    date?: string;
    category?: string;
  },
): Promise<Transaction> {
  return requestData(
    `/api/businesses/${encodeURIComponent(businessId)}/transactions`,
    isTransaction,
    { method: "POST", body: JSON.stringify(transaction) },
  );
}

export function updateTransaction(
  transactionId: string,
  changes: Partial<
    Pick<Transaction, "type" | "description" | "amount" | "currency" | "date" | "category">
  >,
): Promise<Transaction> {
  return requestData(
    `/api/transactions/${encodeURIComponent(transactionId)}`,
    isTransaction,
    {
      method: "PATCH",
      body: JSON.stringify(changes),
    },
  );
}

export function deleteTransaction(
  transactionId: string,
): Promise<{ id: string }> {
  return requestData(
    `/api/transactions/${encodeURIComponent(transactionId)}`,
    isDeletedTransaction,
    { method: "DELETE" },
  );
}

export function calculatePricing(input: PricingCalculationInput): Promise<PricingResult> {
  return requestData(
    "/api/pricing/calculate",
    isPricingResult,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function requestPricingRecommendation(
  calculation: PricingCalculationInput,
  context: PricingRecommendationContext,
): Promise<PricingRecommendationResponse> {
  return requestData(
    "/api/pricing/recommend",
    isPricingRecommendationResponse,
    {
      method: "POST",
      body: JSON.stringify({ calculation, context }),
    },
  );
}

export function createPricingRecord(
  businessId: string,
  record: CreatePricingRecordInput,
): Promise<PricingRecord> {
  return requestData(
    `/api/businesses/${encodeURIComponent(businessId)}/pricing-records`,
    isPricingRecord,
    { method: "POST", body: JSON.stringify(record) },
  );
}

export function getPricingRecords(businessId: string): Promise<PricingRecord[]> {
  return requestData(
    `/api/businesses/${encodeURIComponent(businessId)}/pricing-records`,
    isPricingRecords,
  );
}

export function updatePricingRecord(
  businessId: string,
  pricingRecordId: string,
  changes: UpdatePricingRecordInput,
): Promise<PricingRecord> {
  return requestData(
    `/api/businesses/${encodeURIComponent(businessId)}/pricing-records/${encodeURIComponent(pricingRecordId)}`,
    isPricingRecord,
    { method: "PATCH", body: JSON.stringify(changes) },
  );
}

export function deletePricingRecord(
  businessId: string,
  pricingRecordId: string,
): Promise<{ id: string }> {
  return requestData(
    `/api/businesses/${encodeURIComponent(businessId)}/pricing-records/${encodeURIComponent(pricingRecordId)}`,
    isDeletedPricingRecord,
    { method: "DELETE" },
  );
}

export function parseTransactions(
  businessId: string,
  text: string,
): Promise<ParseTransactionsResult> {
  return requestData(
    "/api/ai/parse-transactions",
    isParseTransactionsResult,
    {
      method: "POST",
      body: JSON.stringify({ businessId, text }),
    },
  );
}
