import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deletePricingRecord,
  getPricingRecords,
  updatePricingRecord,
} from "../lib/api";
import { formatDate, formatMoney } from "../lib/format";
import type {
  PricingRecord,
  PricingRecordType,
  UpdatePricingRecordInput,
} from "../lib/types";
import DropdownSelect from "./DropdownSelect";
import Icon from "./Icon";

const supportedCurrencies = [
  { value: "NGN", label: "NGN (₦)" },
  { value: "USD", label: "USD ($)" },
  { value: "GBP", label: "GBP (£)" },
];

const typeOptions = [
  { value: "all", label: "All types" },
  { value: "product", label: "Products" },
  { value: "service", label: "Services" },
];

interface EditDraft {
  name: string;
  type: PricingRecordType;
  currency: string;
  unitCost: string;
  additionalCosts: string;
  markupPercent: string;
  quantity: string;
  sellingPricePerUnit: string;
}

interface SavedPricesProps {
  businessId: string;
  currency: string;
  onNavigateToCalculator: () => void;
  onReuse: (record: PricingRecord) => void;
}

export default function SavedPrices({
  businessId,
  currency,
  onNavigateToCalculator,
  onReuse,
}: SavedPricesProps) {
  const businessCurrency = currency.trim().toUpperCase();
  const [records, setRecords] = useState<PricingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const requestGeneration = useRef(0);

  const refreshRecords = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadError("");
    try {
      const data = await getPricingRecords(businessId);
      if (generation !== requestGeneration.current) {
        return;
      }
      if (data.some((record) => record.businessId !== businessId)) {
        throw new Error("The server returned pricing records for another business.");
      }
      setRecords(data);
    } catch (requestError) {
      if (generation === requestGeneration.current) {
        setLoadError(
          requestError instanceof Error
            ? requestError.message
            : "Saved prices could not be loaded.",
        );
      }
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false);
      }
    }
  }, [businessId]);

  useEffect(() => {
    void refreshRecords();
    return () => {
      requestGeneration.current += 1;
    };
  }, [refreshRecords]);

  const availableCurrencies = useMemo(() => {
    const present = new Set(
      records.map((record) => record.currency.trim().toUpperCase()),
    );
    return [
      ...supportedCurrencies.filter((currency) => present.has(currency.value)),
      ...[...present]
        .filter(
          (currency) =>
            !supportedCurrencies.some((supported) => supported.value === currency),
        )
        .sort()
        .map((currency) => ({ value: currency, label: currency })),
    ];
  }, [records]);

  const currencyFilterOptions = [
    { value: "all", label: "All currencies" },
    ...availableCurrencies,
  ];

  const editCurrencyOptions = useMemo(
    () => {
      const options = [
        ...supportedCurrencies,
        ...availableCurrencies,
      ];
      if (
        businessCurrency &&
        !options.some((option) => option.value === businessCurrency)
      ) {
        options.unshift({
          value: businessCurrency,
          label: `${businessCurrency} (business currency)`,
        });
      }
      return options.filter(
        (option, index) =>
          options.findIndex((candidate) => candidate.value === option.value) ===
          index,
      );
    },
    [availableCurrencies, businessCurrency],
  );

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return records.filter((record) => {
      const matchesName = !query || record.name.toLocaleLowerCase().includes(query);
      const matchesType = typeFilter === "all" || record.type === typeFilter;
      const matchesCurrency =
        currencyFilter === "all" ||
        record.currency.toUpperCase() === currencyFilter;
      return matchesName && matchesType && matchesCurrency;
    });
  }, [currencyFilter, records, search, typeFilter]);

  function startEditing(record: PricingRecord): void {
    setEditingRecordId(record._id);
    setEditDraft({
      name: record.name,
      type: record.type,
      currency: record.currency,
      unitCost: String(record.unitCost),
      additionalCosts: String(record.additionalCosts),
      markupPercent: String(record.markupPercent),
      quantity: String(record.quantity),
      sellingPricePerUnit: String(record.sellingPricePerUnit),
    });
    setActionError("");
    setActionMessage("");
  }

  function cancelEditing(): void {
    setEditingRecordId(null);
    setEditDraft(null);
    setActionError("");
  }

  function updateDraft<K extends keyof EditDraft>(
    field: K,
    value: EditDraft[K],
  ): void {
    setEditDraft((previous) =>
      previous ? { ...previous, [field]: value } : previous,
    );
  }

  async function saveEdit(
    event: React.FormEvent<HTMLFormElement>,
    recordId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!editDraft || savingEdit) {
      return;
    }
    const changes: UpdatePricingRecordInput = {
      name: editDraft.name.trim(),
      type: editDraft.type,
      currency: editDraft.currency,
      unitCost: Number(editDraft.unitCost),
      additionalCosts: Number(editDraft.additionalCosts),
      markupPercent: Number(editDraft.markupPercent),
      quantity: Number(editDraft.quantity),
      sellingPricePerUnit: Number(editDraft.sellingPricePerUnit),
    };

    setSavingEdit(true);
    setActionError("");
    setActionMessage("");
    try {
      const updated = await updatePricingRecord(businessId, recordId, changes);
      setRecords((previous) =>
        previous.map((record) => (record._id === updated._id ? updated : record)),
      );
      setEditingRecordId(null);
      setEditDraft(null);
      setActionMessage(`${updated.name} was updated.`);
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "The saved price could not be updated.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteRecord(record: PricingRecord): Promise<void> {
    const confirmed = window.confirm(
      `Delete the saved price for "${record.name}"? This will not affect transactions.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingRecordId(record._id);
    setActionError("");
    setActionMessage("");
    try {
      const result = await deletePricingRecord(businessId, record._id);
      if (result.id !== record._id) {
        throw new Error("The server confirmed deletion of a different pricing record.");
      }
      setRecords((previous) =>
        previous.filter((current) => current._id !== record._id),
      );
      if (editingRecordId === record._id) {
        cancelEditing();
      }
      setExpandedRecordId((previous) =>
        previous === record._id ? null : previous,
      );
      setActionMessage(`${record.name} was deleted from saved prices.`);
      await refreshRecords();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "The saved price could not be deleted.",
      );
    } finally {
      setDeletingRecordId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="page-heading">
        <div>
          <h1>Saved Prices</h1>
          <p className="mt-1 text-sm text-muted">
            Review and manage product and service prices saved for this business.
          </p>
        </div>
        <button
          className="button-primary justify-center"
          onClick={onNavigateToCalculator}
          type="button"
        >
          <Icon className="size-4" name="calculator" />
          Price Calculator
        </button>
      </div>

      {actionMessage ? (
        <p className="form-success" role="status">{actionMessage}</p>
      ) : null}
      {actionError ? (
        <p className="form-error" role="alert">{actionError}</p>
      ) : null}
      {loadError ? (
        <div className="notice notice-error" role="alert">
          <span>{loadError}</span>
          <button
            className="text-sm font-semibold underline"
            onClick={() => void refreshRecords()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}

      <section aria-label="Search and filter saved prices" className="panel p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <label className="field">
            <span>Search by name</span>
            <div className="relative">
              <Icon
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                name="search"
              />
              <input
                className="pl-10"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products or services"
                type="search"
                value={search}
              />
            </div>
          </label>
          <div className="field">
            <span>Type</span>
            <DropdownSelect
              ariaLabel="Filter by type"
              onChange={setTypeFilter}
              options={typeOptions}
              value={typeFilter}
            />
          </div>
          <div className="field">
            <span>Currency</span>
            <DropdownSelect
              ariaLabel="Filter by currency"
              onChange={setCurrencyFilter}
              options={currencyFilterOptions}
              value={currencyFilter}
            />
          </div>
        </div>
      </section>

      {loading ? (
        <section
          aria-live="polite"
          className="panel flex min-h-48 items-center justify-center gap-3 p-6 text-sm text-muted"
          role="status"
        >
          <span className="spinner" />
          Loading saved prices…
        </section>
      ) : !loadError && records.length === 0 ? (
        <section className="panel flex min-h-64 flex-col items-center justify-center p-6 text-center">
          <div className="soft-icon mb-4"><Icon name="savedPrices" /></div>
          <h2 className="text-lg font-semibold text-ink">No saved prices yet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted">
            Calculate a price, review the result, then choose Save Price to keep it here for this business.
          </p>
          <button
            className="button-primary mt-5 justify-center"
            onClick={onNavigateToCalculator}
            type="button"
          >
            <Icon className="size-4" name="calculator" />
            Open Price Calculator
          </button>
        </section>
      ) : !loadError && visibleRecords.length === 0 ? (
        <section className="panel p-8 text-center">
          <h2 className="font-semibold text-ink">No matching saved prices</h2>
          <p className="mt-2 text-sm text-muted">
            Try another name, type, or currency filter.
          </p>
        </section>
      ) : null}

      {!loading && !loadError && visibleRecords.length > 0 ? (
        <section aria-label="Saved pricing records">
          <p className="mb-3 text-sm text-muted">
            {visibleRecords.length} {visibleRecords.length === 1 ? "saved price" : "saved prices"}
          </p>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {visibleRecords.map((record) => (
              <article className="panel min-w-0 p-4 sm:p-5" key={record._id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-semibold text-ink">
                      {record.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {record.type === "product" ? "Product" : "Service"} ·{" "}
                      {record.calculationMethod === "ai" ? "AI-assisted" : "Standard"}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-xl font-semibold text-info">
                    {formatMoney(record.sellingPricePerUnit, record.currency)}
                    <span className="mt-0.5 block text-xs font-normal text-muted">per unit</span>
                  </p>
                </div>

                <p className="mt-3 text-xs text-muted">
                  Updated {formatDate(record.updatedAt)}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    aria-controls={`pricing-record-details-${record._id}`}
                    aria-expanded={expandedRecordId === record._id}
                    className="button-secondary justify-center"
                    onClick={() =>
                      setExpandedRecordId((previous) =>
                        previous === record._id ? null : record._id,
                      )
                    }
                    type="button"
                  >
                    <Icon className="size-4" name="activity" />
                    {expandedRecordId === record._id ? "Hide details" : "View details"}
                  </button>
                  <button
                    className="button-secondary justify-center"
                    onClick={() => onReuse(record)}
                    type="button"
                  >
                    <Icon className="size-4" name="calculator" />
                    Reuse in calculator
                  </button>
                  <button
                    className="button-secondary justify-center"
                    disabled={savingEdit || deletingRecordId !== null}
                    onClick={() =>
                      editingRecordId === record._id
                        ? cancelEditing()
                        : startEditing(record)
                    }
                    type="button"
                  >
                    <Icon className="size-4" name="edit" />
                    {editingRecordId === record._id ? "Cancel edit" : "Edit"}
                  </button>
                  <button
                    className="button-secondary justify-center"
                    disabled={savingEdit || deletingRecordId !== null}
                    onClick={() => void deleteRecord(record)}
                    type="button"
                  >
                    <Icon className="size-4" name="trash" />
                    {deletingRecordId === record._id ? "Deleting…" : "Delete"}
                  </button>
                </div>

                {expandedRecordId === record._id ? (
                  <div
                    className="mt-4 rounded-xl border border-line bg-surface-subtle p-4"
                    id={`pricing-record-details-${record._id}`}
                  >
                    <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
                      <Detail label="Currency" value={record.currency} />
                      <Detail
                        label="Unit cost"
                        value={formatMoney(record.unitCost, record.currency)}
                      />
                      <Detail
                        label="Additional costs per unit"
                        value={formatMoney(record.additionalCosts, record.currency)}
                      />
                      <Detail
                        label="Markup"
                        value={`${record.markupPercent.toLocaleString()}%`}
                      />
                      <Detail label="Quantity" value={record.quantity.toLocaleString()} />
                      <Detail
                        label="Selling price per unit"
                        value={formatMoney(record.sellingPricePerUnit, record.currency)}
                      />
                      <Detail
                        label="Calculation method"
                        value={record.calculationMethod === "ai" ? "AI-assisted" : "Standard"}
                      />
                      <Detail label="Created" value={formatDate(record.createdAt)} />
                      <Detail label="Last updated" value={formatDate(record.updatedAt)} />
                      {record.recommendationMetadata ? (
                        <>
                          <Detail
                            label="AI suggested price"
                            value={formatMoney(
                              record.recommendationMetadata.suggestedPrice,
                              record.currency,
                            )}
                          />
                          <Detail
                            label="AI price range"
                            value={`${formatMoney(record.recommendationMetadata.minimumPrice, record.currency)}–${formatMoney(record.recommendationMetadata.maximumPrice, record.currency)}`}
                          />
                        </>
                      ) : null}
                    </dl>
                  </div>
                ) : null}

                {editingRecordId === record._id && editDraft ? (
                  <form
                    className="mt-4 space-y-4 border-t border-line pt-4"
                    onSubmit={(event) => void saveEdit(event, record._id)}
                  >
                    <h3 className="font-semibold text-ink">Edit saved price</h3>
                    <p className="text-xs leading-5 text-muted">
                      Updates apply directly to this record; Ledger will not recalculate the price. Changing currency does not convert amounts.
                    </p>
                    <label className="field">
                      <span>Product or Service Name</span>
                      <input
                        maxLength={200}
                        onChange={(event) => updateDraft("name", event.target.value)}
                        required
                        value={editDraft.name}
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="field">
                        <span>Type</span>
                        <DropdownSelect
                          ariaLabel="Edit product or service type"
                          onChange={(value) => {
                            if (value === "product" || value === "service") {
                              updateDraft("type", value);
                            }
                          }}
                          options={[
                            { value: "product", label: "Product" },
                            { value: "service", label: "Service" },
                          ]}
                          value={editDraft.type}
                        />
                      </div>
                      <div className="field">
                        <span>Currency</span>
                        <DropdownSelect
                          ariaLabel="Edit saved price currency"
                          onChange={(value) => updateDraft("currency", value)}
                          options={editCurrencyOptions}
                          value={editDraft.currency}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <EditNumberField
                        label={`Unit cost (${editDraft.currency})`}
                        min="0"
                        onChange={(value) => updateDraft("unitCost", value)}
                        step="0.01"
                        value={editDraft.unitCost}
                      />
                      <EditNumberField
                        label={`Additional costs per unit (${editDraft.currency})`}
                        min="0"
                        onChange={(value) => updateDraft("additionalCosts", value)}
                        step="0.01"
                        value={editDraft.additionalCosts}
                      />
                      <EditNumberField
                        label="Markup percentage (%)"
                        min="0"
                        onChange={(value) => updateDraft("markupPercent", value)}
                        step="0.01"
                        value={editDraft.markupPercent}
                      />
                      <EditNumberField
                        label="Quantity"
                        min="1"
                        onChange={(value) => updateDraft("quantity", value)}
                        step="1"
                        value={editDraft.quantity}
                      />
                      <EditNumberField
                        label={`Selling price per unit (${editDraft.currency})`}
                        min="0"
                        onChange={(value) => updateDraft("sellingPricePerUnit", value)}
                        step="0.01"
                        value={editDraft.sellingPricePerUnit}
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        className="button-primary justify-center"
                        disabled={savingEdit}
                        type="submit"
                      >
                        {savingEdit ? "Saving changes…" : "Save changes"}
                      </button>
                      <button
                        className="button-secondary justify-center"
                        disabled={savingEdit}
                        onClick={cancelEditing}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words font-medium text-ink">{value}</dd>
    </div>
  );
}

function EditNumberField({
  label,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  min: string;
  onChange: (value: string) => void;
  step: string;
  value: string;
}): React.ReactElement {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        min={min}
        onChange={(event) => onChange(event.target.value)}
        required
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}
