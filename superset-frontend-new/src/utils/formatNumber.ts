export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  const abs = Math.abs(value);

  if (abs >= 1e12) return (value / 1e12).toFixed(1) + "T";
  if (abs >= 1e9) return (value / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (value / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (value / 1e3).toFixed(1) + "K";

  if (abs >= 1) {
    const formatted = value.toFixed(2);
    return Number(formatted).toString();
  }

  if (abs >= 0.01) return value.toFixed(4);

  if (value === 0) return "0";

  return value.toExponential(2);
}

export function formatPercentage(value: number, decimals = 1): string {
  return value.toFixed(decimals) + "%";
}

export function formatBigInt(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toLocaleString();
}
