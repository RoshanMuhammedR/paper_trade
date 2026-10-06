const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return inr2.format(n);
}

export function fmtINR(n: number | null | undefined, opts: { sign?: boolean; decimals?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const { sign = false, decimals = true } = opts;
  const abs = Math.abs(n);
  const body = decimals ? inr2.format(abs) : inr0.format(abs);
  const prefix = n < 0 ? "-" : sign && n > 0 ? "+" : "";
  return `${prefix}₹${body}`;
}

export function fmtSigned(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${inr2.format(Math.abs(n))}`;
}

export function fmtPct(n: number | null | undefined, sign = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${sign && n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return inr0.format(n);
}

export function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return inr0.format(n);
}

const dtFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function fmtDateTime(v: string | number | null | undefined): string {
  if (v == null) return "—";
  return dtFmt.format(new Date(v));
}

export function fmtDate(v: string | number | null | undefined): string {
  if (v == null) return "—";
  return dateFmt.format(new Date(v));
}

export function fmtTime(v: string | number | null | undefined): string {
  if (v == null) return "—";
  return timeFmt.format(new Date(v));
}

export function changeClass(n: number | null | undefined): string {
  if (n == null || n === 0 || !Number.isFinite(n)) return "text-muted";
  return n > 0 ? "text-up" : "text-down";
}
