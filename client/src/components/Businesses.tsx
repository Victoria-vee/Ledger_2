import { useState } from "react";
import { createBusiness } from "../lib/api";
import type { Business } from "../lib/types";
import Icon from "./Icon";

interface BusinessesProps {
  businesses: Business[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreated: (business: Business) => void;
}

export default function Businesses({
  businesses,
  selectedId,
  onSelect,
  onCreated,
}: BusinessesProps) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const business = await createBusiness({
        name: name.trim(),
        currency: currency.trim().toUpperCase(),
        ...(industry.trim() ? { industry: industry.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      onCreated(business);
      setName("");
      setIndustry("");
      setCurrency("NGN");
      setDescription("");
      setSuccess(`${business.name} is ready to use.`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The business could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <div className="page-heading">
        <div>
          <p className="eyebrow">BUSINESS PROFILES</p>
          <h1>Your businesses</h1>
          <p className="mt-2 text-sm text-muted">
            Keep each business’s finances organized in its own space.
          </p>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="panel p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <div className="soft-icon bg-success-soft text-success"><Icon name="plus" /></div>
            <div>
              <h2 className="section-title">Create a business</h2>
              <p className="mt-1 text-sm text-muted">Start a profile for a business you manage.</p>
            </div>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <label className="field">
              <span>Business name</span>
              <input
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder="Olive & Oak Studio"
                required
                value={name}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                <span>Industry <span className="font-normal text-muted">· optional</span></span>
                <input
                  maxLength={100}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder="Design"
                  value={industry}
                />
              </label>
              <label className="field">
                <span>Currency</span>
                <input
                  maxLength={12}
                  onChange={(event) => setCurrency(event.target.value)}
                  placeholder="NGN"
                  required
                  value={currency}
                />
              </label>
            </div>
            <label className="field">
              <span>Description <span className="font-normal text-muted">· optional</span></span>
              <textarea
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="A little about what this business does"
                rows={3}
                value={description}
              />
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {success ? <p className="form-success" role="status">{success}</p> : null}
            <button className="button-primary w-full justify-center sm:w-auto" disabled={busy} type="submit">
              <Icon className="size-4" name="plus" />
              {busy ? "Creating…" : "Create business"}
            </button>
          </form>
        </section>

        <section className="panel p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="section-title">Your profiles</h2>
              <p className="mt-1 text-sm text-muted">
                {businesses.length} {businesses.length === 1 ? "business" : "businesses"}
              </p>
            </div>
            <div className="soft-icon bg-info-soft text-info"><Icon name="briefcase" /></div>
          </div>
          {businesses.length ? (
            <div className="space-y-3">
              {businesses.map((business) => {
                const selected = business._id === selectedId;
                return (
                  <button
                    aria-pressed={selected}
                    className={`business-card w-full text-left ${selected ? "business-card-selected" : ""}`}
                    key={business._id}
                    onClick={() => onSelect(business._id)}
                    type="button"
                  >
                    <span className="business-avatar">{business.name.trim().slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{business.name}</span>
                      <span className="mt-1 block truncate text-xs text-muted">
                        {[business.industry, business.currency || "Currency not set"].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {selected ? (
                      <span className="flex size-7 items-center justify-center rounded-full bg-success-soft text-success">
                        <Icon className="size-4" name="check" />
                      </span>
                    ) : (
                      <Icon className="size-4 text-muted" name="chevron" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-inline min-h-52">
              <div className="soft-icon"><Icon name="briefcase" /></div>
              <p>No businesses yet.</p>
              <span className="max-w-56 text-sm leading-6 text-muted">
                Create a profile to start recording your business finances.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
