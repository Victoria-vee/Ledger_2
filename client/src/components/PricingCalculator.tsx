import { useEffect, useRef, useState } from "react";
import {
  calculatePricing,
  createPricingRecord,
  requestPricingRecommendation,
} from "../lib/api";
import type {
  CreatePricingRecordInput,
  PricingCalculationInput,
  PricingCalculationMethod,
  PricingRecommendationMetadata,
  PricingRecommendation,
  PricingRecommendationContext,
  PricingCalculatorPrefill,
  PricingRecord,
  PricingRecordType,
  PricingResult,
} from "../lib/types";
import Icon from "./Icon";
import { formatMoney } from "../lib/format";
import DropdownSelect from "./DropdownSelect";

const supportedCurrencies = [
  { value: "NGN", label: "NGN (₦)" },
  { value: "USD", label: "USD ($)" },
  { value: "GBP", label: "GBP (£)" },
];

interface SellingPriceResult {
  calculation: PricingResult;
  method: PricingCalculationMethod;
  snapshot: string;
  sellingPricePerUnit: number;
  idempotencyKey: string;
  recommendationMetadata?: PricingRecommendationMetadata;
  savedRecord?: PricingRecord;
}

export default function PricingCalculator({
  businessId,
  currency,
  initialValues,
  onPrefillConsumed,
}: {
  businessId: string;
  currency: string;
  initialValues?: PricingCalculatorPrefill;
  onPrefillConsumed?: () => void;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [type, setType] = useState<PricingRecordType>(
    initialValues?.type ?? "product",
  );
  const [unitCost, setUnitCost] = useState(
    initialValues ? String(initialValues.unitCost) : "",
  );
  const [additionalCosts, setAdditionalCosts] = useState(
    initialValues ? String(initialValues.additionalCosts) : "",
  );
  const [markupPercent, setMarkupPercent] = useState(
    initialValues ? String(initialValues.markupPercent) : "",
  );
  const [quantity, setQuantity] = useState(
    initialValues ? String(initialValues.quantity) : "1",
  );
  const businessCurrency = currency.trim().toUpperCase() || "NGN";
  const [selectedCurrency, setSelectedCurrency] = useState(
    initialValues?.currency ?? businessCurrency,
  );
  const [wasPrefilled] = useState(initialValues !== undefined);
  const [result, setResult] = useState<SellingPriceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [context, setContext] = useState<PricingRecommendationContext>({});
  const [recommendation, setRecommendation] =
    useState<PricingRecommendation | null>(null);
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const [selectedRecommendedPrice, setSelectedRecommendedPrice] =
    useState<number | null>(null);
  const calculationGeneration = useRef(0);
  const savingRef = useRef(false);
  const prefillConsumed = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const currencyOptions = [
    ...new Set(
      [businessCurrency, initialValues?.currency].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ]
    .filter(
      (value) =>
        !supportedCurrencies.some((option) => option.value === value),
    )
    .map((value) => ({
      value,
      label: `${value} (${value === businessCurrency ? "business currency" : "saved currency"})`,
    }))
    .concat(supportedCurrencies);

  useEffect(() => {
    if (!initialValues) {
      setSelectedCurrency(businessCurrency);
    }
    invalidateCalculation();
  }, [businessId, businessCurrency]);

  useEffect(() => {
    if (initialValues && !prefillConsumed.current) {
      prefillConsumed.current = true;
      onPrefillConsumed?.();
    }
  }, [initialValues, onPrefillConsumed]);

  function invalidateCalculation(): void {
    calculationGeneration.current += 1;
    setResult(null);
    setBusy(false);
    setRecommendation(null);
    setRecommendationError("");
    setSelectedRecommendedPrice(null);
    setRecommendationBusy(false);
    setSaveError("");
    setSaveSuccess("");
  }

  function updateCalculationInput(
    setValue: (value: string) => void,
    value: string,
  ): void {
    setValue(value);
    invalidateCalculation();
    setError("");
  }

  function updateName(value: string): void {
    setName(value);
    invalidateCalculation();
  }

  function updateType(value: PricingRecordType): void {
    setType(value);
    invalidateCalculation();
  }

  function updateContext(
    field: keyof PricingRecommendationContext,
    value: string,
  ): void {
    setContext((previous) => ({ ...previous, [field]: value }));
    invalidateCalculation();
  }

  function buildCalculationRequest(): PricingCalculationInput {
    return {
      unitCost: Number(unitCost),
      additionalCosts: additionalCosts === "" ? 0 : Number(additionalCosts),
      markupPercent: Number(markupPercent),
      quantity: quantity === "" ? 1 : Number(quantity),
    };
  }

  function getCurrentSnapshot(): string {
    return JSON.stringify({
      businessId,
      name,
      type,
      currency: selectedCurrency,
      unitCost,
      additionalCosts,
      markupPercent,
      quantity,
      context,
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const generation = ++calculationGeneration.current;
    setResult(null);
    setRecommendation(null);
    setRecommendationError("");
    setSelectedRecommendedPrice(null);
    setSaveError("");
    setSaveSuccess("");
    setRecommendationBusy(false);
    const snapshot = getCurrentSnapshot();
    const calculationRequest = buildCalculationRequest();
    setBusy(true);
    try {
      const calculation = await calculatePricing(calculationRequest);
      if (generation === calculationGeneration.current) {
        setResult({
          calculation,
          method: "standard",
          snapshot,
          sellingPricePerUnit: calculation.sellingPricePerUnit,
          idempotencyKey: crypto.randomUUID(),
        });
      }
    } catch (submitError) {
      if (generation === calculationGeneration.current) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "The price could not be calculated.",
        );
      }
    } finally {
      if (generation === calculationGeneration.current) {
        setBusy(false);
      }
    }
  }

  async function requestRecommendation(): Promise<void> {
    if (!formRef.current?.reportValidity()) {
      return;
    }
    const generation = ++calculationGeneration.current;
    const snapshot = getCurrentSnapshot();
    const calculationRequest = buildCalculationRequest();
    setResult(null);
    setRecommendation(null);
    setRecommendationError("");
    setSelectedRecommendedPrice(null);
    setSaveError("");
    setSaveSuccess("");
    setBusy(false);
    setRecommendationBusy(true);
    try {
      const response = await requestPricingRecommendation(calculationRequest, {
        ...context,
        currency: selectedCurrency,
      });
      if (generation !== calculationGeneration.current) {
        return;
      }
      const recommendationMetadata = {
        suggestedPrice: response.recommendation.suggestedPrice.price,
        minimumPrice: response.recommendation.priceRange.minimum.price,
        maximumPrice: response.recommendation.priceRange.maximum.price,
      };
      setResult({
        calculation: response.calculation,
        method: "ai",
        snapshot,
        sellingPricePerUnit: recommendationMetadata.suggestedPrice,
        idempotencyKey: crypto.randomUUID(),
        recommendationMetadata,
      });
      setSelectedRecommendedPrice(recommendationMetadata.suggestedPrice);
      setRecommendation(response.recommendation);
    } catch (requestError) {
      if (generation !== calculationGeneration.current) {
        return;
      }
      setRecommendationError(
        requestError instanceof Error
          ? requestError.message
          : "The local AI pricing recommendation could not be generated.",
      );
    } finally {
      if (generation === calculationGeneration.current) {
        setRecommendationBusy(false);
      }
    }
  }

  function updateCurrency(value: string): void {
    setSelectedCurrency(value);
    invalidateCalculation();
  }

  function selectRecommendedPrice(price: number): void {
    if (result?.method === "ai" && result.sellingPricePerUnit === price) {
      return;
    }
    setSelectedRecommendedPrice(price);
    setResult((previous) =>
      previous?.method === "ai"
        ? {
            ...previous,
            sellingPricePerUnit: price,
            idempotencyKey: crypto.randomUUID(),
            savedRecord: undefined,
          }
        : previous,
    );
    setSaveError("");
    setSaveSuccess("");
  }

  async function savePrice(): Promise<void> {
    if (savingRef.current || !result || result.snapshot !== getCurrentSnapshot()) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveError("Enter a product or service name before saving this price.");
      return;
    }

    const request: CreatePricingRecordInput = {
      name: trimmedName,
      type,
      currency: selectedCurrency,
      calculation: buildCalculationRequest(),
      calculationMethod: result.method,
      idempotencyKey: result.idempotencyKey,
      ...(result.method === "ai"
        ? {
            sellingPricePerUnit: result.sellingPricePerUnit,
            recommendationMetadata: result.recommendationMetadata,
          }
        : {}),
    };

    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const savedRecord = await createPricingRecord(businessId, request);
      setResult((previous) =>
        previous?.idempotencyKey === result.idempotencyKey
          ? { ...previous, savedRecord }
          : previous,
      );
      setSaveSuccess(`${trimmedName} was saved to this business's pricing records.`);
    } catch (requestError) {
      setSaveError(
        requestError instanceof Error
          ? requestError.message
          : "The price could not be saved. Please try again.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="page-heading">
        <h1>Price Calculator</h1>
      </div>

      <section className="panel p-5 sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="soft-icon bg-info-soft text-info"><Icon name="calculator" /></div>
          <div>
            <h2 className="section-title">Standard price calculator</h2>
            <p className="mt-1 text-sm text-muted">Enter your unit costs, markup, and currency.</p>
          </div>
        </div>
        {wasPrefilled ? (
          <p className="mb-5 rounded-xl border border-line bg-info-soft px-4 py-3 text-sm leading-5 text-info">
            Saved inputs were reused, but the previous result was not. Calculate again to create a new current result. Changing currency does not convert the stored amounts.
          </p>
        ) : null}
        <form className="space-y-4" onSubmit={submit} ref={formRef}>
          <fieldset className="min-w-0 space-y-4 border-0 p-0" disabled={saving}>
            <section aria-labelledby="product-details-title" className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-ink" id="product-details-title">
                  Product or service details
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Give this price a name so you can save and find it later.
                </p>
              </div>
              <label className="field">
                <span>Product or Service Name</span>
                <input
                  maxLength={200}
                  onChange={(event) => updateName(event.target.value)}
                  placeholder="Handmade Tote Bag"
                  value={name}
                />
              </label>
              <fieldset className="field min-w-0 border-0 p-0">
                <legend className="mb-2 text-sm font-medium text-ink">Type</legend>
                <div aria-label="Product or service type" className="grid grid-cols-2 gap-3" role="group">
                  {(["product", "service"] as const).map((option) => (
                    <button
                      aria-pressed={type === option}
                      className={`${type === option ? "button-primary" : "button-secondary"} w-full justify-center capitalize`}
                      key={option}
                      onClick={() => updateType(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>
            <label className="field">
              <span>Currency</span>
              <DropdownSelect
                ariaLabel="Currency"
                onChange={updateCurrency}
                options={currencyOptions}
                value={selectedCurrency}
              />
              <small>Amounts use the selected currency; no currency conversion is applied.</small>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                <span>Unit cost ({selectedCurrency})</span>
                <input
                  min="0"
                  onChange={(event) => updateCalculationInput(setUnitCost, event.target.value)}
                  placeholder="0.00"
                  required
                  step="0.01"
                  type="number"
                  value={unitCost}
                />
                <small>What it costs to make or buy one unit.</small>
              </label>
              <label className="field">
                <span>Additional costs per unit ({selectedCurrency})</span>
                <input
                  min="0"
                  onChange={(event) => updateCalculationInput(setAdditionalCosts, event.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={additionalCosts}
                />
                <small>Packaging, delivery, or other per-unit costs.</small>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                <span>Markup percentage (%)</span>
                <input
                  className="appearance-none"
                  min="0"
                  onChange={(event) => updateCalculationInput(setMarkupPercent, event.target.value)}
                  placeholder="25"
                  required
                  step="0.01"
                  type="number"
                  value={markupPercent}
                />
                <small>Markup is profit divided by cost; it differs from profit margin.</small>
              </label>
              <label className="field">
                <span>Quantity</span>
                <input
                  min="1"
                  onChange={(event) => updateCalculationInput(setQuantity, event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={quantity}
                />
                <small>Whole number of units.</small>
              </label>
            </div>
            <PricingAdviceForm context={context} onContextChange={updateContext} />
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {recommendationError ? (
              <p className="form-error" role="alert">{recommendationError}</p>
            ) : null}
            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row">
              <button
                className="button-primary w-full justify-center"
                disabled={busy || recommendationBusy || saving}
                type="submit"
              >
                <Icon className="size-4" name="calculator" />
                {busy ? "Calculating…" : "Calculate Price"}
              </button>
              <button
                className="button-secondary w-full justify-center"
                disabled={busy || recommendationBusy || saving}
                onClick={() => void requestRecommendation()}
                type="button"
              >
                <Icon className="size-4" name="sparkles" />
                {recommendationBusy ? "Getting AI advice…" : "Get AI Pricing Advice"}
              </button>
            </div>
          </fieldset>
          <p className="text-xs leading-5 text-muted">
            AI suggestions are guidance only; review the result before saving a price.
          </p>
        </form>
        {result && result.snapshot === getCurrentSnapshot() ? (
          <div
            aria-live="polite"
            className="mt-6 rounded-2xl bg-success-soft p-4 sm:p-5"
            role="status"
          >
            <p className="text-sm font-medium text-muted">Selling Price Result · {result.method === "ai" ? "AI advice" : "standard calculation"}</p>
            <p className="mt-1 break-all text-3xl font-semibold tracking-tight text-success sm:text-4xl">
              {formatMoney(result.sellingPricePerUnit, selectedCurrency)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {result.method === "ai"
                ? "Based on the AI suggested price or the scenario you selected."
                : `Based on a ${result.calculation.markupPercent.toLocaleString()}% markup.`}
            </p>
            {saveSuccess ? <p className="form-success mt-3" role="status">{saveSuccess}</p> : null}
            {saveError ? <p className="form-error mt-3" role="alert">{saveError}</p> : null}
            {!name.trim() ? (
              <p className="mt-3 text-sm text-muted">Enter a product or service name to save this result.</p>
            ) : null}
            <button
              className="button-primary mt-4 justify-center"
              disabled={saving || Boolean(result.savedRecord) || !name.trim()}
              onClick={() => void savePrice()}
              type="button"
            >
              {saving
                ? "Saving…"
                : result.savedRecord
                  ? "Price saved"
                  : "Save Price"}
            </button>
          </div>
        ) : null}
      </section>
      {recommendation ? (
        <PricingAdvice
          currency={selectedCurrency}
          onSelect={selectRecommendedPrice}
          recommendation={recommendation}
          disabled={saving}
          selectedPrice={selectedRecommendedPrice}
        />
      ) : null}
    </div>
  );
}

function PricingAdviceForm({
  context,
  onContextChange,
}: {
  context: PricingRecommendationContext;
  onContextChange: (
    field: keyof PricingRecommendationContext,
    value: string,
  ) => void;
}) {
  return (
    <details className="rounded-xl border border-line">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info">
        Optional context for AI advice
      </summary>
      <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
        <label className="field">
          <span>Business type <span className="font-normal text-muted">· optional</span></span>
          <input
            maxLength={200}
            onChange={(event) => onContextChange("businessType", event.target.value)}
            placeholder="Tailoring"
            value={context.businessType ?? ""}
          />
        </label>
        <label className="field">
          <span>Intended customer <span className="font-normal text-muted">· optional</span></span>
          <input
            maxLength={300}
            onChange={(event) => onContextChange("intendedCustomer", event.target.value)}
            placeholder="Local families"
            value={context.intendedCustomer ?? ""}
          />
        </label>
        <label className="field sm:col-span-2">
          <span>Product or service description <span className="font-normal text-muted">· optional</span></span>
          <textarea
            maxLength={500}
            onChange={(event) => onContextChange("productDescription", event.target.value)}
            placeholder="What are you pricing?"
            rows={2}
            value={context.productDescription ?? ""}
          />
        </label>
        <label className="field">
          <span>Perceived quality <span className="font-normal text-muted">· optional</span></span>
          <input
            maxLength={200}
            onChange={(event) => onContextChange("perceivedQuality", event.target.value)}
            placeholder="Premium, handmade"
            value={context.perceivedQuality ?? ""}
          />
        </label>
        <label className="field">
          <span>Pricing goal <span className="font-normal text-muted">· optional</span></span>
          <input
            maxLength={300}
            onChange={(event) => onContextChange("pricingGoal", event.target.value)}
            placeholder="Introductory offer"
            value={context.pricingGoal ?? ""}
          />
        </label>
        <label className="field sm:col-span-2">
          <span>Market evidence <span className="font-normal text-muted">· optional</span></span>
          <textarea
            maxLength={1000}
            onChange={(event) => onContextChange("marketEvidence", event.target.value)}
            placeholder="Any observed competitor prices or customer feedback (not independently verified)"
            rows={2}
            value={context.marketEvidence ?? ""}
          />
        </label>
      </div>
    </details>
  );
}

function PricingAdvice({
  currency,
  disabled,
  onSelect,
  recommendation,
  selectedPrice,
}: {
  currency: string;
  disabled: boolean;
  onSelect: (price: number) => void;
  recommendation: PricingRecommendation;
  selectedPrice: number | null;
}) {
  return (
    <section
      aria-labelledby="pricing-advice-title"
      className="mt-5 rounded-2xl border border-line bg-info-soft p-4 sm:p-5"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">LOCAL AI ASSISTANCE</p>
          <h3 className="mt-1 text-lg font-semibold text-info" id="pricing-advice-title">
            Pricing recommendation
          </h3>
        </div>
        <span className="badge-note">Advice, not a saved price</span>
      </div>
      <div className="mt-4 rounded-xl bg-white p-4">
        <p className="text-sm text-muted">Suggested price per unit</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-info">
          {formatMoney(recommendation.suggestedPrice.price, currency)}
        </p>
        <p className="mt-1 text-sm text-muted">
          Suggested range: {formatMoney(recommendation.priceRange.minimum.price, currency)}–{formatMoney(recommendation.priceRange.maximum.price, currency)}
        </p>
        <VerifiedPriceDetails price={recommendation.suggestedPrice} currency={currency} />
        <button
          className="button-secondary mt-4"
          disabled={disabled}
          onClick={() => onSelect(recommendation.suggestedPrice.price)}
          type="button"
        >
          {selectedPrice === recommendation.suggestedPrice.price
            ? "Selected for consideration"
            : "Select suggested price"}
        </button>
      </div>

      <p className="mt-4 text-sm leading-6 text-ink">{recommendation.explanation}</p>
      <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm leading-6 text-ink">
        {recommendation.affordabilityVsProfit}
      </p>

      {recommendation.scenarios.length ? (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-ink">Price scenarios</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {recommendation.scenarios.map((scenario) => (
              <article className="rounded-xl border border-line bg-white p-4" key={scenario.level}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {scenario.level.replace("-", " ")}
                </p>
                <p className="mt-2 text-xl font-semibold text-info">
                  {formatMoney(scenario.result.price, currency)}
                </p>
                <VerifiedPriceDetails currency={currency} price={scenario.result} />
                <p className="mt-3 text-xs leading-5 text-muted">{scenario.rationale}</p>
                <button
                  className="button-secondary mt-3 w-full justify-center"
                  disabled={disabled}
                  onClick={() => onSelect(scenario.result.price)}
                  type="button"
                >
                  {selectedPrice === scenario.result.price ? "Selected" : "Select this price"}
                </button>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <AdviceList title="Assumptions" items={recommendation.assumptions} />
        <AdviceList title="Information to consider" items={recommendation.missingInformation} />
      </div>

      {selectedPrice !== null ? (
        <p className="form-success mt-4" role="status">
          {formatMoney(selectedPrice, currency)} is the current price for the result above. It will be saved only when you choose Save Price.
        </p>
      ) : null}
      <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-xs leading-5 text-warning">
        {recommendation.marketValidationNote}
      </p>
    </section>
  );
}

function VerifiedPriceDetails({
  price,
  currency,
}: {
  price: PricingRecommendation["suggestedPrice"];
  currency: string;
}) {
  return (
    <dl className="mt-3 space-y-1 text-xs text-muted">
      <div className="flex justify-between gap-2">
        <dt>Gross profit per unit</dt>
        <dd className="font-medium text-info">{formatMoney(price.grossProfitPerUnit, currency)}</dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt>Projected gross profit</dt>
        <dd className="font-medium text-info">{formatMoney(price.projectedGrossProfit, currency)}</dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt>Gross profit margin</dt>
        <dd className="font-medium text-info">{formatPercent(price.grossProfitMarginPercent)}</dd>
      </div>
    </dl>
  );
}

function AdviceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      {items.length ? (
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-5 text-muted">
          {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-5 text-muted">None noted by the model.</p>
      )}
    </div>
  );
}

function formatPercent(value: number | null): string {
  return value === null ? "N/A (zero selling price)" : `${value.toLocaleString()}%`;
}
