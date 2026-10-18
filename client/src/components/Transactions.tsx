import { useEffect, useState } from "react";
import { createTransaction, deleteTransaction, updateTransaction } from "../lib/api";
import type { Transaction, TransactionType } from "../lib/types";
import DropdownSelect from "./DropdownSelect";
import Icon from "./Icon";
import TransactionForm from "./TransactionForm";
import { TransactionRow } from "./Dashboard";

interface TransactionsProps {
  businessId: string;
  currency: string;
  transactions: Transaction[];
  loading: boolean;
  error: string;
  initialFilter: "all" | TransactionType;
  onRefresh: () => Promise<void>;
}

export default function Transactions({
  businessId,
  currency,
  transactions,
  loading,
  error,
  initialFilter,
  onRefresh,
}: TransactionsProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | TransactionType>(initialFilter);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const visibleTransactions = transactions.filter((transaction) => {
    const matchesFilter = filter === "all" || transaction.type === filter;
    const matchesQuery =
      !query.trim() ||
      [transaction.description, transaction.category ?? ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase());
    return matchesFilter && matchesQuery;
  });

  function startCreate() {
    setEditing(null);
    setActionError("");
    setFormOpen(true);
  }

  function startEdit(transaction: Transaction) {
    setEditing(transaction);
    setActionError("");
    setFormOpen(true);
  }

  async function saveTransaction(value: {
    type: TransactionType;
    description: string;
    amount: number;
    currency: string;
    date: string;
    category?: string;
  }) {
    setBusy(true);
    setActionError("");
    try {
      if (editing) {
        await updateTransaction(editing._id, value);
      } else {
        await createTransaction(businessId, value);
      }
      setFormOpen(false);
      setEditing(null);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeTransaction(transaction: Transaction) {
    if (!window.confirm(`Delete “${transaction.description}”? This cannot be undone.`)) {
      return;
    }
    setActionError("");
    try {
      await deleteTransaction(transaction._id);
      await onRefresh();
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "The transaction could not be deleted.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MONEY IN, MONEY OUT</p>
          <h1>Transactions</h1>
          <p className="mt-2 text-sm text-muted">
            A clear record of what’s happening in your business.
          </p>
        </div>
        <button className="button-primary" onClick={startCreate} type="button">
          <Icon className="size-4" name="plus" /> Add transaction
        </button>
      </div>

      {formOpen ? (
        <section className="panel p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="eyebrow">{editing ? "UPDATE RECORD" : "NEW RECORD"}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
                {editing ? "Edit transaction" : "Add a transaction"}
              </h2>
            </div>
            <button aria-label="Close form" className="icon-button icon-button-close" onClick={() => setFormOpen(false)} type="button">
              <Icon name="close" />
            </button>
          </div>
          <TransactionForm
            busy={busy}
            currency={currency}
            onCancel={() => setFormOpen(false)}
            onSubmit={saveTransaction}
            transaction={editing}
          />
        </section>
      ) : null}

      {actionError || error ? (
        <div className="notice notice-error" role="alert">
          <span>{actionError || error}</span>
          {error ? <button className="text-sm font-semibold underline" onClick={() => void onRefresh()} type="button">Try again</button> : null}
        </div>
      ) : null}

      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="section-title">All activity</h2>
            <p className="mt-1 text-sm text-muted">
              {transactions.length} {transactions.length === 1 ? "record" : "records"}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="search-field">
              <Icon className="size-4 text-muted" name="search" />
              <input
                aria-label="Search transactions"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search activity"
                value={query}
              />
            </label>
            <DropdownSelect
              ariaLabel="Filter by transaction type"
              className="transaction-filter w-full sm:w-36"
              onChange={(value) => {
                if (value === "all" || value === "income" || value === "expense") {
                  setFilter(value);
                }
              }}
              options={[
                { value: "all", label: "All types" },
                { value: "income", label: "Income" },
                { value: "expense", label: "Expenses" },
              ]}
              value={filter}
            />
          </div>
        </div>
        {loading ? (
          <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-muted">
            <span className="spinner" /> Loading transactions…
          </div>
        ) : visibleTransactions.length ? (
          <div className="divide-y divide-line px-5 sm:px-6">
            {visibleTransactions.map((transaction) => (
              <div className="flex items-center gap-3" key={transaction._id}>
                <div className="min-w-0 flex-1">
                  <TransactionRow currency={currency} transaction={transaction} />
                </div>
                <button
                  aria-label={`Edit ${transaction.description}`}
                  className="icon-button"
                  onClick={() => startEdit(transaction)}
                  type="button"
                >
                  <Icon className="size-[17px]" name="edit" />
                </button>
                <button
                  aria-label={`Delete ${transaction.description}`}
                  className="icon-button icon-button-danger"
                  onClick={() => void removeTransaction(transaction)}
                  type="button"
                >
                  <Icon className="size-[17px]" name="trash" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-inline min-h-60 px-6">
            <div className="soft-icon"><Icon name={query || filter !== "all" ? "search" : "wallet"} /></div>
            <p>{query || filter !== "all" ? "No matching transactions." : "Nothing recorded yet."}</p>
            <span className="text-sm text-muted">
              {query || filter !== "all"
                ? "Try a different search or filter."
                : "Add your first income or expense to get started."}
            </span>
            {!query && filter === "all" ? (
              <button className="button-secondary mt-2" onClick={startCreate} type="button">
                <Icon className="size-4" name="plus" /> Add transaction
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
