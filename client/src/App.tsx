import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AiEntry from "./components/AiEntry";
import Businesses from "./components/Businesses";
import BusinessSelector from "./components/BusinessSelector";
import Dashboard from "./components/Dashboard";
import Icon from "./components/Icon";
import PricingCalculator from "./components/PricingCalculator";
import SavedPrices from "./components/SavedPrices";
import Transactions from "./components/Transactions";
import { getBusinesses, getBusinessSummary, getHealth, getTransactions } from "./lib/api";
import type {
  Business,
  BusinessSummary,
  HealthResponse,
  PricingCalculatorPrefill,
  PricingRecord,
  Transaction,
  TransactionType,
} from "./lib/types";

type Section =
  | "dashboard"
  | "transactions"
  | "ai"
  | "pricing"
  | "saved-prices"
  | "businesses";
type NavIcon =
  | "dashboard"
  | "wallet"
  | "sparkles"
  | "calculator"
  | "savedPrices"
  | "briefcase";

const navigation: Array<{
  id: Exclude<Section, "businesses">;
  label: string;
  icon: Exclude<NavIcon, "briefcase">;
}> = [
  { id: "dashboard", label: "Overview", icon: "dashboard" },
  { id: "transactions", label: "Transactions", icon: "wallet" },
  { id: "ai", label: "AI entry", icon: "sparkles" },
  { id: "pricing", label: "Price Calculator", icon: "calculator" },
  { id: "saved-prices", label: "Saved Prices", icon: "savedPrices" },
];

const mobileNavigation: Array<{ id: Section; label: string; icon: NavIcon }> = [
  ...navigation,
  { id: "businesses", label: "Business", icon: "briefcase" },
];

export default function App() {
  const [section, setSection] = useState<Section>("dashboard");
  const [transactionFilter, setTransactionFilter] = useState<"all" | TransactionType>("all");
  const [calculatorPrefill, setCalculatorPrefill] =
    useState<PricingCalculatorPrefill | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessesLoading, setBusinessesLoading] = useState(true);
  const [businessesError, setBusinessesError] = useState("");
  const [selectedId, setSelectedId] = useState(
    () => window.localStorage.getItem("ledger.selectedBusiness") ?? "",
  );
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthCheckFailed, setHealthCheckFailed] = useState(false);
  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const workspaceRequestId = useRef<number>(0);

  const selectedBusiness = useMemo(
    () => businesses.find((business) => business._id === selectedId) ?? null,
    [businesses, selectedId],
  );

  const refreshBusinesses = useCallback(async () => {
    setBusinessesLoading(true);
    setBusinessesError("");
    try {
      const data = await getBusinesses();
      setBusinesses(data);
      const storedId = window.localStorage.getItem("ledger.selectedBusiness");
      const nextId =
        data.find((business) => business._id === storedId)?._id ??
        data[0]?._id ??
        "";
      setSelectedId(nextId);
      if (nextId) {
        window.localStorage.setItem("ledger.selectedBusiness", nextId);
      } else {
        window.localStorage.removeItem("ledger.selectedBusiness");
      }
    } catch (loadError) {
      setBusinessesError(
        loadError instanceof Error
          ? loadError.message
          : "Businesses could not be loaded.",
      );
    } finally {
      setBusinessesLoading(false);
    }
  }, []);

  const refreshWorkspace = useCallback(
    async (businessId: string = selectedId) => {
      const requestId = ++workspaceRequestId.current;
      if (!businessId) {
        setSummary(null);
        setTransactions([]);
        setWorkspaceError("");
        setWorkspaceLoading(false);
        return;
      }
      setWorkspaceLoading(true);
      setWorkspaceError("");
      try {
        const [nextSummary, nextTransactions] = await Promise.all([
          getBusinessSummary(businessId),
          getTransactions(businessId),
        ]);
        if (requestId === workspaceRequestId.current) {
          setSummary(nextSummary);
          setTransactions(nextTransactions);
        }
      } catch (loadError) {
        if (requestId === workspaceRequestId.current) {
          setSummary(null);
          setTransactions([]);
          setWorkspaceError(
            loadError instanceof Error
              ? loadError.message
              : "Business data could not be loaded.",
          );
        }
      } finally {
        if (requestId === workspaceRequestId.current) {
          setWorkspaceLoading(false);
        }
      }
    },
    [selectedId],
  );

  useEffect(() => {
    void refreshBusinesses();
    getHealth()
      .then((data) => {
        setHealth(data);
        setHealthCheckFailed(false);
      })
      .catch(() => {
        setHealth(null);
        setHealthCheckFailed(true);
      });
  }, [refreshBusinesses]);

  useEffect(() => {
    void refreshWorkspace(selectedId);
  }, [refreshWorkspace, selectedId]);

  function selectBusiness(businessId: string) {
    setSelectedId(businessId);
    if (businessId) {
      window.localStorage.setItem("ledger.selectedBusiness", businessId);
    } else {
      window.localStorage.removeItem("ledger.selectedBusiness");
    }
  }

  function navigateToTransactions(filter: "all" | TransactionType = "all") {
    setTransactionFilter(filter);
    setSection("transactions");
  }

  function handleBusinessCreated(business: Business) {
    setBusinesses((previous) => [business, ...previous]);
    selectBusiness(business._id);
  }

  function reuseSavedPrice(record: PricingRecord): void {
    setCalculatorPrefill({
      name: record.name,
      type: record.type,
      currency: record.currency,
      unitCost: record.unitCost,
      additionalCosts: record.additionalCosts,
      markupPercent: record.markupPercent,
      quantity: record.quantity,
    });
    setSection("pricing");
  }

  const sectionTitle =
    section === "dashboard"
      ? "Overview"
      : section === "transactions"
        ? "Transactions"
        : section === "ai"
          ? "AI transaction entry"
          : section === "pricing"
            ? "Price Calculator"
            : section === "saved-prices"
              ? "Saved Prices"
            : "Businesses";

  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="app-header">
        <a aria-label="Ledger home" className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setSection("dashboard"); }}>
          <span className="brand-mark">
            <Icon className="size-5" name="dashboard" />
          </span>
          <span>
            <span className="block text-[1.15rem] font-semibold leading-5 tracking-[-0.04em]">Ledger</span>
            <span className="mt-1 hidden text-[10px] font-medium uppercase tracking-[0.16em] text-muted sm:block">Small business finance</span>
          </span>
        </a>

        <div className="header-actions">
          {businesses.length ? (
            <BusinessSelector
              businesses={businesses}
              onSelect={selectBusiness}
              selectedId={selectedId}
            />
          ) : null}
          <button
            aria-label="Create a business"
            className="header-add"
            onClick={() => setSection("businesses")}
            type="button"
          >
            <Icon className="size-4" name="plus" />
            <span className="hidden sm:inline">New business</span>
          </button>
        </div>
      </header>

      <div className="app-layout">
        <aside aria-label="Main navigation" className="desktop-sidebar">
          <p className="sidebar-label">WORKSPACE</p>
          <nav className="space-y-1">
            {navigation.map((item) => (
              <NavButton
                active={section === item.id}
                icon={item.icon}
                key={item.id}
                label={item.label}
                onClick={() => {
                  if (item.id === "transactions") {
                    navigateToTransactions();
                  } else {
                    setSection(item.id);
                  }
                }}
              />
            ))}
          </nav>
          <div className="my-5 border-t border-line" />
          <p className="sidebar-label">MANAGE</p>
          <NavButton
            active={section === "businesses"}
            icon="briefcase"
            label="Businesses"
            onClick={() => setSection("businesses")}
          />

          <div className="sidebar-spacer" />
          <div className="sidebar-profile">
            <div className="profile-avatar">{selectedBusiness?.name.trim().slice(0, 1).toUpperCase() || "L"}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{selectedBusiness?.name ?? "Your workspace"}</p>
              <p className="mt-0.5 text-xs text-muted">{selectedBusiness?.currency ?? "Create a business"}</p>
            </div>
          </div>
        </aside>

        <main className="main-content">
          {businessesError ? (
            <div className="notice notice-error mb-6" role="alert">
              <span>{businessesError}</span>
              <button className="text-sm font-semibold underline" onClick={() => void refreshBusinesses()} type="button">Retry</button>
            </div>
          ) : null}
          {healthCheckFailed || health?.status === "unhealthy" ? (
            <div className="notice notice-error mb-6" role="alert">
              <span>
                {healthCheckFailed
                  ? "Ledger's API is unavailable."
                  : "Ledger's database health check failed."}
              </span>
            </div>
          ) : null}

          {!selectedBusiness && section !== "businesses" ? (
            <div className="panel flex min-h-[25rem] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="soft-icon mb-5"><Icon name="briefcase" /></div>
              <p className="eyebrow">A FRESH START</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                {businessesLoading ? "Finding your workspace…" : "Create your first business"}
              </h1>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                {businessesLoading
                  ? "We’re loading your businesses from Ledger."
                  : "Your finances stay organized by business. Set up a profile to begin."}
              </p>
              {!businessesLoading ? (
                <button className="button-primary mt-6" onClick={() => setSection("businesses")} type="button">
                  <Icon className="size-4" name="plus" /> Create a business
                </button>
              ) : <span className="spinner mt-5" />}
            </div>
          ) : selectedBusiness && section === "dashboard" ? (
            <Dashboard
              business={selectedBusiness}
              currency={selectedBusiness.currency}
              error={workspaceError}
              loading={workspaceLoading}
              onNavigate={(destination, filter) => {
                if (destination === "transactions") {
                  navigateToTransactions(filter);
                } else {
                  setSection(destination);
                }
              }}
              onRetry={() => void refreshWorkspace()}
              summary={summary}
              transactions={transactions}
            />
          ) : section === "businesses" ? (
            <Businesses
              businesses={businesses}
              onCreated={handleBusinessCreated}
              onSelect={(id) => { selectBusiness(id); setSection("dashboard"); }}
              selectedId={selectedId}
            />
          ) : selectedBusiness && section === "transactions" ? (
            <Transactions
              businessId={selectedBusiness._id}
              currency={selectedBusiness.currency}
              error={workspaceError}
              loading={workspaceLoading}
              initialFilter={transactionFilter}
              onRefresh={() => refreshWorkspace(selectedBusiness._id)}
              transactions={transactions}
            />
          ) : selectedBusiness && section === "pricing" ? (
            <PricingCalculator
              businessId={selectedBusiness._id}
              currency={selectedBusiness.currency}
              initialValues={calculatorPrefill ?? undefined}
              key={selectedBusiness._id}
              onPrefillConsumed={() => setCalculatorPrefill(null)}
            />
          ) : selectedBusiness && section === "saved-prices" ? (
            <SavedPrices
              businessId={selectedBusiness._id}
              currency={selectedBusiness.currency}
              key={selectedBusiness._id}
              onNavigateToCalculator={() => {
                setCalculatorPrefill(null);
                setSection("pricing");
              }}
              onReuse={reuseSavedPrice}
            />
          ) : selectedBusiness && section === "ai" ? (
            <AiEntry
              businessId={selectedBusiness._id}
              currency={selectedBusiness.currency}
              onSaved={() => refreshWorkspace(selectedBusiness._id)}
            />
          ) : null}

          <footer className="app-footer">
            <span>Ledger · A clearer picture of your business.</span>
            <span>{selectedBusiness ? `Managing ${selectedBusiness.name}` : "Your finances, in focus"}</span>
          </footer>
        </main>
      </div>

      <nav aria-label="Mobile navigation" className="mobile-nav">
        {mobileNavigation.map((item) => (
          <NavButton
            active={section === item.id}
            icon={item.icon}
            key={item.id}
            label={item.label}
            onClick={() => {
              if (item.id === "transactions") {
                navigateToTransactions();
              } else {
                setSection(item.id);
              }
            }}
            compact
          />
        ))}
      </nav>
    </div>
  );
}

interface NavButtonProps {
  active: boolean;
  icon: NavIcon;
  label: string;
  onClick: () => void;
  compact?: boolean;
}

function NavButton({ active, icon, label, onClick, compact = false }: NavButtonProps) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`${compact ? "mobile-nav-item" : "nav-item"} ${active ? "nav-item-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-[19px]" name={icon} />
      <span>{label}</span>
    </button>
  );
}
