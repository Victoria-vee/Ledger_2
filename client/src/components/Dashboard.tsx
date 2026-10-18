import type { Business, BusinessSummary, Transaction } from "../lib/types";
import Icon from "./Icon";
import { formatDate, formatMoney } from "../lib/format";

interface DashboardProps {
  business: Business;
  summary: BusinessSummary | null;
  transactions: Transaction[];
  loading: boolean;
  error: string;
  currency: string;
  onRetry: () => void;
  onNavigate: (
    section: "transactions" | "pricing",
    filter?: "all" | "income" | "expense",
  ) => void;
}

export default function Dashboard({
  business,
  summary,
  transactions,
  loading,
  error,
  currency,
  onRetry,
  onNavigate,
}: DashboardProps) {
  const recentTransactions = transactions.slice(0, 5);
  const currencySummaries = summary?.currencies.length
    ? summary.currencies
    : [{
        currency: currency || "NGN",
        totalIncome: 0,
        totalExpenses: 0,
        netBalance: 0,
        incomeCount: 0,
        expenseCount: 0,
        transactionCount: 0,
      }];
  const businessName = business.name.trim();
  return (
    <div className="space-y-7">
      <div className="page-heading">
        <div>
          <h1>{businessName ? `Good to see you, ${businessName}.` : "Good to see you."}</h1>
        </div>
        <button
          className="button-primary"
          onClick={() => onNavigate("transactions")}
          type="button"
        >
          <Icon className="size-4" name="plus" />
          Add transaction
        </button>
      </div>

      {!currency ? (
        <div className="notice notice-warning">
          <span>
            This business profile has no currency set; NGN is being used as the display and transaction default.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="notice notice-error" role="alert">
          <span>{error}</span>
          <button className="text-sm font-semibold underline" onClick={onRetry} type="button">
            Try again
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="panel flex min-h-52 items-center justify-center gap-3 text-sm text-muted">
          <span className="spinner" />
          Loading your latest numbers…
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              accent="mint"
              icon="arrowTrendUp"
              label="Total income"
              values={currencySummaries.map((item) => ({
                currency: item.currency,
                value: formatMoney(item.totalIncome, item.currency),
              }))}
              onClick={() => onNavigate("transactions", "income")}
            />
            <MetricCard
              accent="peach"
              icon="arrowTrendDown"
              label="Total expenses"
              values={currencySummaries.map((item) => ({
                currency: item.currency,
                value: formatMoney(item.totalExpenses, item.currency),
              }))}
              onClick={() => onNavigate("transactions", "expense")}
            />
            <MetricCard
              accent="lavender"
              icon="wallet"
              label="Net balance"
              values={currencySummaries.map((item) => ({
                currency: item.currency,
                value: formatMoney(item.netBalance, item.currency),
              }))}
              onClick={() => onNavigate("transactions", "all")}
            />
            <MetricCard
              accent="sand"
              icon="activity"
              label="Transactions"
              values={[{ value: summary.transactionCount.toLocaleString() }]}
              onClick={() => onNavigate("transactions", "all")}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="panel p-5 sm:p-6">
              <div className="mb-7 flex items-start justify-between gap-3">
                <div>
                  <h2 className="section-title">Income & expenses</h2>
                  <p className="mt-1 text-sm text-muted">All recorded activity</p>
                </div>
              </div>
              {summary.transactionCount === 0 ? (
                <div className="empty-inline">
                  <div className="soft-icon"><Icon name="activity" /></div>
                  <p>No transactions to compare yet.</p>
                  <button
                    className="text-sm font-semibold text-success hover:underline"
                    onClick={() => onNavigate("transactions")}
                    type="button"
                  >
                    Record your first transaction
                  </button>
                </div>
              ) : (
                <div className="space-y-7">
                  {currencySummaries.map((item) => {
                    const maxTotal = Math.max(item.totalIncome, item.totalExpenses);
                    const incomeWidth = maxTotal > 0 ? (item.totalIncome / maxTotal) * 100 : 0;
                    const expenseWidth = maxTotal > 0 ? (item.totalExpenses / maxTotal) * 100 : 0;
                    return (
                      <div className="space-y-4" key={item.currency}>
                        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          {item.currency}
                        </h3>
                        <BalanceBar
                          color="bg-success"
                          icon="arrowTrendUp"
                          label="Income"
                          value={formatMoney(item.totalIncome, item.currency)}
                          width={incomeWidth}
                        />
                        <BalanceBar
                          color="bg-danger"
                          icon="arrowTrendDown"
                          label="Expenses"
                          value={formatMoney(item.totalExpenses, item.currency)}
                          width={expenseWidth}
                        />
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-xs text-muted">
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2 rounded-full bg-success" /> Income
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2 rounded-full bg-danger" /> Expenses
                    </span>
                    <span className="ml-auto">Totals use actual transaction data</span>
                  </div>
                </div>
              )}
            </section>

            <section className="panel p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="section-title">Recent transactions</h2>
                  <p className="mt-1 text-sm text-muted">Your latest activity</p>
                </div>
                <button
                  aria-label="View all transactions"
                  className="icon-button"
                  onClick={() => onNavigate("transactions")}
                  type="button"
                >
                  <Icon name="chevron" />
                </button>
              </div>
              {recentTransactions.length ? (
                <div className="divide-y divide-line">
                  {recentTransactions.map((transaction) => (
                    <TransactionRow
                      currency={currency}
                      key={transaction._id}
                      transaction={transaction}
                      compact
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-inline min-h-36">
                  <p>Your activity will appear here.</p>
                </div>
              )}
              {transactions.length > 5 ? (
                <button
                  className="mt-4 w-full rounded-xl bg-success-soft py-2.5 text-sm font-semibold text-ink hover:bg-success-soft"
                  onClick={() => onNavigate("transactions")}
                  type="button"
                >
                  View all transactions
                </button>
              ) : null}
            </section>
          </div>

          <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-4">
              <div className="soft-icon bg-info-soft text-info">
                <Icon name="calculator" />
              </div>
              <div>
                <h2 className="font-semibold text-ink">Ready to price your next product?</h2>
                <p className="mt-1 text-sm text-muted">Turn your costs and markup into a clear price.</p>
              </div>
            </div>
            <button
              className="button-secondary shrink-0"
              onClick={() => onNavigate("pricing")}
              type="button"
            >
              Open calculator <Icon className="size-4" name="arrowUpRight" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  accent,
  icon,
  label,
  values,
  onClick,
}: {
  accent: string;
  icon: "arrowTrendUp" | "arrowTrendDown" | "wallet" | "activity";
  label: string;
  values: Array<{ currency?: string; value: string }>;
  onClick: () => void;
}) {
  return (
    <button
      className="panel metric-card p-5 text-left transition"
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{label}</span>
        <span className={`metric-icon ${accent}`}><Icon className="size-[18px]" name={icon} /></span>
      </div>
      <div className="mt-5 space-y-2">
        {values.map(({ currency: currencyCode, value }) => (
          <p
            className={`flex flex-wrap items-baseline gap-x-2 break-all font-semibold tracking-[-0.045em] text-ink ${
              values.length === 1 ? "text-[1.65rem]" : "text-base"
            }`}
            key={currencyCode ?? "transactions"}
          >
            {currencyCode ? (
              <span className="text-[0.65rem] font-semibold tracking-normal text-muted">
                {currencyCode}
              </span>
            ) : null}
            <span>{value}</span>
          </p>
        ))}
      </div>
    </button>
  );
}

function BalanceBar({
  label,
  value,
  width,
  color,
  icon,
}: {
  label: string;
  value: string;
  width: number;
  color: string;
  icon: "arrowTrendUp" | "arrowTrendDown";
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-ink">
          <Icon className="size-4 text-muted" name={icon} />
          {label}
        </span>
        <span className="font-semibold text-ink">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-success-soft">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function TransactionRow({
  transaction,
  currency,
  compact = false,
}: {
  transaction: Transaction;
  currency: string;
  compact?: boolean;
}) {
  const money = formatMoney(
    transaction.amount,
    transaction.currency?.trim() || currency.trim() || "NGN",
  );

  return (
    <div className={`flex items-center gap-3 py-3.5 ${compact ? "" : "sm:gap-4"}`}>
      <span className={`transaction-icon ${transaction.type}`}>
        <Icon className="size-4" name={transaction.type === "income" ? "arrowTrendUp" : "arrowTrendDown"} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{transaction.description}</p>
        <p className="mt-1 truncate text-xs text-muted">
          {transaction.category || (transaction.type === "income" ? "Income" : "Expense")}
          <span className="px-1.5">·</span>
          {formatDate(transaction.date)}
        </p>
      </div>
      <p className={`shrink-0 text-sm font-semibold ${transaction.type === "income" ? "text-success" : "text-danger"}`}>
        {transaction.type === "income" ? "+" : "−"}{money}
      </p>
    </div>
  );
}
