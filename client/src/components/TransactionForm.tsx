import { useState } from "react";
import type { FormEvent } from "react";
import type { Transaction, TransactionType } from "../lib/types";
import DropdownSelect from "./DropdownSelect";
import Icon from "./Icon";

const supportedCurrencies = [
  { code: "NGN", label: "NGN (₦)" },
  { code: "USD", label: "USD ($)" },
  { code: "GBP", label: "GBP (£)" },
];

interface TransactionFormProps {
  transaction?: Transaction | null;
  currency: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (value: {
    type: TransactionType;
    description: string;
    amount: number;
    currency: string;
    date: string;
    category?: string;
  }) => Promise<void>;
}

export default function TransactionForm({
  transaction,
  currency,
  busy,
  onCancel,
  onSubmit,
}: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? "expense");
  const [description, setDescription] = useState(
    transaction?.description ?? "",
  );
  const [amount, setAmount] = useState(
    transaction ? String(transaction.amount) : "",
  );
  const [date, setDate] = useState(
    transaction?.date ? transaction.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [category, setCategory] = useState(transaction?.category ?? "");
  const defaultCurrency = currency.trim().toUpperCase() || "NGN";
  const [selectedCurrency, setSelectedCurrency] = useState(
    transaction?.currency?.trim().toUpperCase() || defaultCurrency,
  );
  const [error, setError] = useState("");
  const currencyOptions = supportedCurrencies.some(
    (option) => option.code === selectedCurrency,
  )
    ? supportedCurrencies
    : [
        { code: selectedCurrency, label: `${selectedCurrency} (current currency)` },
        ...supportedCurrencies,
      ];
  const currencySymbol =
    supportedCurrencies.find((option) => option.code === selectedCurrency)?.label.match(/\((.+)\)/)?.[1] ??
    selectedCurrency;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    try {
      await onSubmit({
        type,
        description: description.trim(),
        amount: parsedAmount,
        currency: selectedCurrency,
        date,
        ...(category.trim() ? { category: category.trim() } : {}),
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The transaction could not be saved.",
      );
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="flex gap-2 rounded-2xl p-1.5">
        {(["expense", "income"] as TransactionType[]).map((value) => (
          <button
            aria-pressed={type === value}
            className={`transaction-type-button ${value} ${type === value ? "is-selected" : ""}`}
            key={value}
            onClick={() => setType(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field sm:col-span-2">
          <span>Description</span>
          <input
            autoFocus
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            placeholder=" Website design project"
            required
            value={description}
          />
        </label>
        <label className="field">
          <span>Amount ({selectedCurrency} · {currencySymbol})</span>
          <input
            min="0.01"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </label>
        <label className="field">
          <span>Currency</span>
          <DropdownSelect
            ariaLabel="Currency"
            onChange={setSelectedCurrency}
            options={currencyOptions.map((option) => ({
              value: option.code,
              label: option.label,
            }))}
            value={selectedCurrency}
          />
        </label>
        <label className="field">
          <span>Date</span>
          <input
            onChange={(event) => setDate(event.target.value)}
            required
            type="date"
            value={date}
          />
        </label>
        <label className="field sm:col-span-2">
          <span>Category <span className="font-normal text-muted">· optional</span></span>
          <input
            maxLength={100}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Supplies"
            value={category}
          />
        </label>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="flex justify-end gap-3 border-t border-line pt-4">
        <button className="button-secondary" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="button-primary" disabled={busy} type="submit">
          {busy ? "Saving…" : transaction ? "Save changes" : "Save transaction"}
          <Icon className="size-4" name="arrowUpRight" />
        </button>
      </div>
    </form>
  );
}
