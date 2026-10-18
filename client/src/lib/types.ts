export type TransactionType = "income" | "expense";

export interface Business {
  _id: string;
  name: string;
  industry?: string;
  currency: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  _id: string;
  businessId: string;
  type: TransactionType;
  description: string;
  amount: number;
  currency?: string;
  date: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessSummary {
  currencies: Array<{
    currency: string;
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    incomeCount: number;
    expenseCount: number;
    transactionCount: number;
  }>;
  transactionCount: number;
}

export interface PricingResult {
  unitCost: number;
  additionalCosts: number;
  totalUnitCost: number;
  markupPercent: number;
  sellingPricePerUnit: number;
  profitPerUnit: number;
  grossProfitPerUnit: number;
  grossProfitMarginPercent: number | null;
  totalRevenue: number;
  totalProfit: number;
  targetMargin: {
    targetMarginPercent: number;
    sellingPricePerUnit: number;
    grossProfitPerUnit: number;
    grossProfitMarginPercent: number | null;
  } | null;
  alternatives: Array<{
    sellingPricePerUnit: number;
    grossProfitPerUnit: number;
    projectedGrossProfit: number;
    grossProfitMarginPercent: number | null;
  }>;
}

export interface PricingCalculationInput {
  unitCost: number;
  additionalCosts: number;
  markupPercent: number;
  quantity: number;
  targetMarginPercent?: number;
  alternativePrices?: number[];
}

export type PricingRecordType = "product" | "service";
export type PricingCalculationMethod = "standard" | "ai";

export interface PricingRecommendationMetadata {
  suggestedPrice: number;
  minimumPrice: number;
  maximumPrice: number;
}

export interface PricingRecord {
  _id: string;
  businessId: string;
  name: string;
  type: PricingRecordType;
  currency: string;
  unitCost: number;
  additionalCosts: number;
  markupPercent: number;
  quantity: number;
  sellingPricePerUnit: number;
  calculationMethod: PricingCalculationMethod;
  recommendationMetadata?: PricingRecommendationMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePricingRecordInput {
  name: string;
  type: PricingRecordType;
  currency: string;
  calculation: PricingCalculationInput;
  calculationMethod: PricingCalculationMethod;
  sellingPricePerUnit?: number;
  recommendationMetadata?: PricingRecommendationMetadata;
  idempotencyKey: string;
}

export type UpdatePricingRecordInput = Partial<
  Pick<
    PricingRecord,
    | "name"
    | "type"
    | "currency"
    | "unitCost"
    | "additionalCosts"
    | "markupPercent"
    | "quantity"
    | "sellingPricePerUnit"
  >
>;

export type SavedPricingCalculationInput = Pick<
  PricingCalculationInput,
  "unitCost" | "additionalCosts" | "markupPercent" | "quantity"
>;

export type PricingCalculatorPrefill = SavedPricingCalculationInput &
  Pick<PricingRecord, "name" | "type" | "currency">;

export interface PricingRecommendationContext {
  currency?: string;
  businessType?: string;
  productDescription?: string;
  intendedCustomer?: string;
  perceivedQuality?: string;
  pricingGoal?: string;
  marketEvidence?: string;
}

export interface VerifiedPrice {
  price: number;
  grossProfitPerUnit: number;
  projectedGrossProfit: number;
  grossProfitMarginPercent: number | null;
}

export interface PricingRecommendation {
  suggestedPrice: VerifiedPrice;
  priceRange: {
    minimum: VerifiedPrice;
    maximum: VerifiedPrice;
  };
  explanation: string;
  assumptions: string[];
  missingInformation: string[];
  affordabilityVsProfit: string;
  scenarios: Array<{
    level: "conservative" | "balanced" | "higher-margin";
    rationale: string;
    result: VerifiedPrice;
  }>;
  marketEvidenceProvided: boolean;
  marketValidationNote: string;
}

export interface PricingRecommendationResponse {
  calculation: PricingResult;
  recommendation: PricingRecommendation;
}

export interface TransactionDraft {
  type: TransactionType;
  description: string;
  amount: number | null;
  date: string | null;
  category?: string;
}

export interface DraftUncertainty {
  draftIndex: number | null;
  field: "type" | "amount" | "date" | "other";
  reason: string;
}

export interface ParseTransactionsResult {
  drafts: TransactionDraft[];
  uncertainties: DraftUncertainty[];
  requiresReview: true;
}

export interface HealthResponse {
  status: "ok" | "unhealthy";
  application: "ok";
  database: "connected" | "connecting" | "disconnecting" | "disconnected";
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;
