import { useState } from "react";
import type { FormEvent } from "react";
import { createTransaction, parseTransactions } from "../lib/api";
import type { DraftUncertainty, TransactionType } from "../lib/types";
import DropdownSelect from "./DropdownSelect";
import Icon from "./Icon";

interface EditableDraft {
  sourceIndex: number;
  type: TransactionType;
  description: string;
  amount: number | null;
  amountText: string;
  date: string;
  category: string;
}

type EditableDraftField = "type" | "description" | "amountText" | "date" | "category";

export default function AiEntry({
  businessId,
  currency,
  onSaved,
}: {
  businessId: string;
  currency: string;
  onSaved: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<EditableDraft[]>([]);
  const [uncertainties, setUncertainties] = useState<DraftUncertainty[]>([]);
  const [parsing, setParsing] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function parse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setDrafts([]);
    setUncertainties([]);
    setParsing(true);
    try {
      const result = await parseTransactions(businessId, text.trim());
      setDrafts(
        result.drafts.map((draft, sourceIndex) => ({
          ...draft,
          sourceIndex,
          amountText: draft.amount === null ? "" : String(draft.amount),
          date: draft.date ?? "",
          category: draft.category ?? "",
        })),
      );
      setUncertainties(result.uncertainties);
      if (result.drafts.length === 0) {
        setSuccess(
          "No transaction draft was identified. Try a clear action word such as “bought” for an expense or “sold” for income, and include the amount and date when available.",
        );
      }
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "The AI service could not parse this text.",
      );
    } finally {
      setParsing(false);
    }
  }

  function updateDraft(sourceIndex: number, field: EditableDraftField, value: string) {
    setDrafts((previous) =>
      previous.map((draft) => {
        if (draft.sourceIndex !== sourceIndex) return draft;
        if (field === "type") {
          return { ...draft, type: value === "income" ? "income" : "expense" };
        }
        if (field === "description") return { ...draft, description: value };
        if (field === "amountText") return { ...draft, amountText: value };
        if (field === "date") return { ...draft, date: value };
        return { ...draft, category: value };
      }),
    );
  }

  async function saveDraft(draft: EditableDraft) {
    const amount = Number(draft.amountText);
    if (!Number.isFinite(amount) || amount <= 0 || !draft.date || !draft.description.trim()) {
      return;
    }

    setError("");
    setSuccess("");
    setSavingIndex(draft.sourceIndex);
    try {
      await createTransaction(businessId, {
        type: draft.type,
        description: draft.description.trim(),
        amount,
        date: draft.date,
        ...(draft.category.trim() ? { category: draft.category.trim() } : {}),
      });
      setDrafts((previous) =>
        previous.filter((item) => item.sourceIndex !== draft.sourceIndex),
      );
      setUncertainties((previous) =>
        previous.filter((item) => item.draftIndex !== draft.sourceIndex),
      );
      await onSaved();
      setSuccess("Reviewed transaction saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The reviewed transaction could not be saved.",
      );
    } finally {
      setSavingIndex(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AI-ASSISTED TRANSACTIONS</p>
          <h1>Draft a transaction</h1>
          <p className="mt-2 text-sm text-muted">
            Describe what happened. Review every detail before saving.
          </p>
        </div>
        <span className="badge-note">
          <span className="size-1.5 rounded-full bg-success" />
          Groq-hosted model
        </span>
      </div>

      <section className="panel p-5 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <div className="soft-icon bg-info-soft text-info"><Icon name="sparkles" /></div>
          <div>
            <h2 className="section-title">What happened?</h2>
            <p className="mt-1 text-sm text-muted">Include a clear amount and date when you know them.</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={parse}>
          <label className="field">
            <span>Transaction description</span>
            <textarea
              maxLength={2000}
              onChange={(event) => setText(event.target.value)}
              placeholder="For example: Received 25,000 naira from a customer today for the logo design project."
              required
              rows={4}
              value={text}
            />
            <small className="text-right">{text.length}/2000 characters</small>
          </label>
          <p className="text-sm leading-5 text-muted" role="note">
            Tip: “bought,” “purchased,” or “spent” suggests an expense; “sold,”
            “earned,” or “received payment” suggests income. Include the amount
            and date when available, then review the draft before saving.
          </p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {success ? <p className="form-success" role="status">{success}</p> : null}
          <button
            className="button-primary"
            disabled={parsing || !text.trim()}
            type="submit"
          >
            <Icon className="size-4" name="sparkles" />
            {parsing ? "Reading your description…" : "Create draft"}
          </button>
          <p className="text-xs leading-5 text-muted">
            Ledger sends this text to a Groq-hosted open-weight model to extract draft transactions. Nothing is saved until you review and confirm a draft below.
          </p>
        </form>
      </section>

      {uncertainties.some((item) => item.draftIndex === null) ? (
        <section className="notice notice-warning">
          <div className="soft-icon soft-icon-small bg-warning-soft text-warning"><Icon name="activity" /></div>
          <div>
            <p className="font-semibold text-warning">A detail needs clarification</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm leading-5 text-warning">
              {uncertainties
                .filter((item) => item.draftIndex === null)
                .map((item, index) => <li key={`${item.field}-${index}`}>{item.reason}</li>)}
            </ul>
          </div>
        </section>
      ) : null}

      {drafts.length ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="eyebrow">REVIEW BEFORE SAVING</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">
                {drafts.length} {drafts.length === 1 ? "draft" : "drafts"} to check
              </h2>
            </div>
            <span className="text-xs text-muted">Nothing is saved automatically</span>
          </div>
          {drafts.map((draft) => {
            const amount = Number(draft.amountText);
            const canSave =
              Number.isFinite(amount) &&
              amount > 0 &&
              Boolean(draft.date) &&
              Boolean(draft.description.trim());
            const draftWarnings = uncertainties.filter(
              (item) =>
                item.draftIndex === draft.sourceIndex && item.field !== "other",
            );
            const otherWarnings = uncertainties.filter(
              (item) =>
                item.draftIndex === draft.sourceIndex && item.field === "other",
            );

            return (
              <article className="panel p-5 sm:p-7" key={draft.sourceIndex}>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="soft-icon bg-success-soft text-ink">
                      <Icon name="edit" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-ink">Transaction draft</h3>
                      <p className="mt-0.5 text-xs text-muted">Review and edit before saving</p>
                    </div>
                  </div>
                  <span className="badge-note">Needs your review</span>
                </div>

                {draftWarnings.length || otherWarnings.length ? (
                  <div className="mb-5 rounded-xl border border-line bg-warning-soft p-4 text-sm text-warning">
                    <p className="font-semibold">Check these details</p>
                    <ul className="mt-1 list-inside list-disc space-y-1 leading-5">
                      {[...draftWarnings, ...otherWarnings].map((item, index) => (
                        <li key={`${item.field}-${index}`}>{item.reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="field">
                    <span>Type</span>
                    <DropdownSelect
                      ariaLabel="Draft transaction type"
                      onChange={(value) => updateDraft(draft.sourceIndex, "type", value)}
                      options={[
                        { value: "income", label: "Income" },
                        { value: "expense", label: "Expense" },
                      ]}
                      value={draft.type}
                    />
                  </label>
                  <label className="field">
                    <span>Amount ({currency || "currency not set"})</span>
                    <input
                      min="0.01"
                      onChange={(event) => updateDraft(draft.sourceIndex, "amountText", event.target.value)}
                      placeholder="Confirm the amount"
                      step="0.01"
                      type="number"
                      value={draft.amountText}
                    />
                  </label>
                  <label className="field sm:col-span-2">
                    <span>Description</span>
                    <input
                      maxLength={500}
                      onChange={(event) => updateDraft(draft.sourceIndex, "description", event.target.value)}
                      required
                      value={draft.description}
                    />
                  </label>
                  <label className="field">
                    <span>Date</span>
                    <input
                      onChange={(event) => updateDraft(draft.sourceIndex, "date", event.target.value)}
                      type="date"
                      value={draft.date}
                    />
                    {!draft.date ? <small>Choose a date; the AI did not confirm one.</small> : null}
                  </label>
                  <label className="field">
                    <span>Category <span className="font-normal text-muted">· optional</span></span>
                    <input
                      maxLength={100}
                      onChange={(event) => updateDraft(draft.sourceIndex, "category", event.target.value)}
                      placeholder="e.g. Sales"
                      value={draft.category}
                    />
                  </label>
                </div>

                <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-muted">
                    Saving sends this reviewed entry to your business transactions.
                  </p>
                  <button
                    className="button-primary shrink-0"
                    disabled={!canSave || savingIndex === draft.sourceIndex}
                    onClick={() => void saveDraft(draft)}
                    type="button"
                  >
                    {savingIndex === draft.sourceIndex ? "Saving…" : "Confirm & save"}
                    <Icon className="size-4" name="check" />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
