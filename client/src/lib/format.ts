export function formatMoney(amount: number, currency: string): string {
  const numberFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  });
  const normalizedCurrency =
    typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (!normalizedCurrency) {
    return numberFormatter.format(amount);
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    return `${normalizedCurrency} ${numberFormatter.format(amount)}`;
  }
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
