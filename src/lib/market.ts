// Indian market helpers. All functions take/return epoch milliseconds.

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const SESSION_OPEN_MIN = 9 * 60 + 15; // 09:15 IST
export const SESSION_CLOSE_MIN = 15 * 60 + 30; // 15:30 IST
const DAY_MS = 86_400_000;

export interface IstParts {
  year: number;
  month: number; // 0-based
  date: number;
  weekday: number; // 0 = Sunday
  minutes: number; // minutes since IST midnight
}

export function istParts(ms: number): IstParts {
  const d = new Date(ms + IST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    date: d.getUTCDate(),
    weekday: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/** Epoch ms for an IST wall-clock time */
export function istTime(year: number, month: number, date: number, minutes = 0): number {
  return Date.UTC(year, month, date, 0, minutes) - IST_OFFSET_MS;
}

/** IST midnight for the day containing `ms` */
export function istDayStart(ms: number): number {
  const p = istParts(ms);
  return istTime(p.year, p.month, p.date);
}

export function isWeekday(ms: number): boolean {
  const w = istParts(ms).weekday;
  return w >= 1 && w <= 5;
}

/** Rough session check (ignores exchange holidays). Prefer `SymbolMeta.isOpen` when available. */
export function isWithinSessionHours(ms: number): boolean {
  if (!isWeekday(ms)) return false;
  const m = istParts(ms).minutes;
  return m >= SESSION_OPEN_MIN && m < SESSION_CLOSE_MIN;
}

/** Close of the session an order placed at `ms` belongs to (next 15:30 IST on a weekday). */
export function sessionCloseFor(ms: number): number {
  let day = istDayStart(ms);
  const p = istParts(ms);
  if (!(isWeekday(ms) && p.minutes < SESSION_CLOSE_MIN)) {
    day += DAY_MS;
  }
  while (!isWeekday(day + DAY_MS / 2)) day += DAY_MS;
  return day + SESSION_CLOSE_MIN * 60_000;
}

/** Next session open strictly after `ms` (ignores holidays) */
export function nextSessionOpen(ms: number): number {
  let day = istDayStart(ms);
  const p = istParts(ms);
  if (!(isWeekday(ms) && p.minutes < SESSION_OPEN_MIN)) day += DAY_MS;
  while (!isWeekday(day + DAY_MS / 2)) day += DAY_MS;
  return day + SESSION_OPEN_MIN * 60_000;
}

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

const INDEX_NAMES: Record<string, string> = {
  "^NSEI": "NIFTY 50",
  "^NSEBANK": "NIFTY BANK",
  "^BSESN": "SENSEX",
  "^CNXIT": "NIFTY IT",
  "^INDIAVIX": "INDIA VIX",
  "^NSEMDCP50": "NIFTY MIDCAP 50",
  "^CNXAUTO": "NIFTY AUTO",
  "^CNXPHARMA": "NIFTY PHARMA",
  "^CNXFMCG": "NIFTY FMCG",
  "^CNXMETAL": "NIFTY METAL",
  "^CNXENERGY": "NIFTY ENERGY",
  "^CNXREALTY": "NIFTY REALTY",
  "^CNXPSUBANK": "NIFTY PSU BANK",
  "NIFTY_FIN_SERVICE.NS": "NIFTY FIN SERVICE",
};

export const TICKER_INDICES = ["^NSEI", "^NSEBANK", "^BSESN", "^CNXIT", "^INDIAVIX"];

export function isIndex(symbol: string): boolean {
  return symbol.startsWith("^") || symbol in INDEX_NAMES;
}

export function isTradable(symbol: string): boolean {
  return /\.(NS|BO)$/i.test(symbol) && !isIndex(symbol);
}

export function displaySymbol(symbol: string): string {
  if (INDEX_NAMES[symbol]) return INDEX_NAMES[symbol];
  return symbol.replace(/\.(NS|BO)$/i, "").replace(/^\^/, "");
}

export function exchangeOf(symbol: string): "NSE" | "BSE" | "INDEX" | "OTHER" {
  if (isIndex(symbol)) return "INDEX";
  if (/\.NS$/i.test(symbol)) return "NSE";
  if (/\.BO$/i.test(symbol)) return "BSE";
  return "OTHER";
}

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Accepts plain NSE tickers like "INFY" and maps them to Yahoo symbols */
export function toYahooSymbol(raw: string): string {
  const s = normalizeSymbol(raw);
  if (s.startsWith("^") || s.includes(".") || s.includes("=")) return s;
  return `${s}.NS`;
}

export const SYMBOL_RE = /^[\^A-Z0-9&._=-]{1,32}$/;
