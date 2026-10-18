import type { z } from "zod";
import { calculatePricingSchema } from "../schemas/pricing.js";

type PricingInput = z.output<typeof calculatePricingSchema>;

export interface PricingCalculation {
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

export class PricingPrecisionError extends Error {
  constructor() {
    super("The supplied values produce amounts outside the supported monetary precision.");
    this.name = "PricingPrecisionError";
  }
}

const maximumSafeMoney = Number.MAX_SAFE_INTEGER / 100;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertSafeMoney(...values: number[]): void {
  if (
    values.some(
      (value) =>
        !Number.isFinite(value) || Math.abs(value) > maximumSafeMoney,
    )
  ) {
    throw new PricingPrecisionError();
  }
}

function grossProfitMargin(
  grossProfitPerUnit: number,
  sellingPricePerUnit: number,
): number | null {
  if (sellingPricePerUnit <= 0) {
    return null;
  }
  return roundPercent((grossProfitPerUnit / sellingPricePerUnit) * 100);
}

export function calculatePricing(input: PricingInput): PricingCalculation {
  const { unitCost, additionalCosts, markupPercent, quantity } = input;
  const totalUnitCost = unitCost + additionalCosts;
  const sellingPricePerUnit =
    totalUnitCost * (1 + markupPercent / 100);
  const profitPerUnit = sellingPricePerUnit - totalUnitCost;
  const totalRevenue = sellingPricePerUnit * quantity;
  const totalProfit = profitPerUnit * quantity;
  const alternatives = (input.alternativePrices ?? []).map((price) => {
    const grossProfitPerUnit = price - totalUnitCost;
    const projectedGrossProfit = grossProfitPerUnit * quantity;
    assertSafeMoney(price, grossProfitPerUnit, projectedGrossProfit);
    return {
      sellingPricePerUnit: roundMoney(price),
      grossProfitPerUnit: roundMoney(grossProfitPerUnit),
      projectedGrossProfit: roundMoney(projectedGrossProfit),
      grossProfitMarginPercent: grossProfitMargin(grossProfitPerUnit, price),
    };
  });

  let targetMargin: PricingCalculation["targetMargin"] = null;
  if (input.targetMarginPercent !== undefined) {
    const targetPrice =
      totalUnitCost / (1 - input.targetMarginPercent / 100);
    const roundedTargetPrice = roundMoney(targetPrice);
    const targetGrossProfit = roundedTargetPrice - totalUnitCost;
    assertSafeMoney(targetPrice, roundedTargetPrice, targetGrossProfit);
    if (roundedTargetPrice <= 0) {
      throw new PricingPrecisionError();
    }
    targetMargin = {
      targetMarginPercent: input.targetMarginPercent,
      sellingPricePerUnit: roundedTargetPrice,
      grossProfitPerUnit: roundMoney(targetGrossProfit),
      grossProfitMarginPercent: grossProfitMargin(
        targetGrossProfit,
        roundedTargetPrice,
      ),
    };
  }

  assertSafeMoney(
    totalUnitCost,
    sellingPricePerUnit,
    profitPerUnit,
    totalRevenue,
    totalProfit,
  );

  return {
    unitCost: roundMoney(unitCost),
    additionalCosts: roundMoney(additionalCosts),
    totalUnitCost: roundMoney(totalUnitCost),
    markupPercent,
    sellingPricePerUnit: roundMoney(sellingPricePerUnit),
    profitPerUnit: roundMoney(profitPerUnit),
    grossProfitPerUnit: roundMoney(profitPerUnit),
    grossProfitMarginPercent: grossProfitMargin(
      profitPerUnit,
      sellingPricePerUnit,
    ),
    totalRevenue: roundMoney(totalRevenue),
    totalProfit: roundMoney(totalProfit),
    targetMargin,
    alternatives,
  };
}
