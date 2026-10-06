// Server-only Yahoo Finance client (free, keyless). Responses are cached
// in-process for a few seconds so many browser tabs polling the same symbol
// translate into a single upstream request.
import type { Bar, Quote, SearchResult, SymbolMeta } from "./types";
import { mergeDuplicateBars, normalizeBarTime, type YahooInterval } from "./timeframes";
import { displaySymbol, exchangeOf } from "./market";

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  Accept: "application/json",
};

interface CacheEntry<T> {
  expires: number;
  value: Promise<T>;
}
const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;
  const value = fn().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { expires: now + ttlMs, value });
  if (cache.size > 2000) {
    for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
  }
  return value;
}

export class UpstreamError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

async function yahooJson<T>(path: string): Promise<T> {
  let lastErr: unknown;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, { headers: HEADERS, cache: "no-store" });
      if (res.status === 404) {
        const body = await res.json().catch(() => null);
        const desc = body?.chart?.error?.description ?? "Symbol not found";
        throw new UpstreamError(desc, 404);
      }
      if (!res.ok) throw new UpstreamError(`Yahoo responded ${res.status}`, res.status === 429 ? 429 : 502);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof UpstreamError && err.status === 404) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new UpstreamError("Market data unavailable");
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: Record<string, any>;
      timestamp?: number[];
      indicators: { quote: Array<{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }> };
    }> | null;
    error: { description?: string } | null;
  };
}

export interface ChartParams {
  symbol: string;
  interval: YahooInterval;
  period1?: number; // seconds
  period2?: number; // seconds
  range?: string;
}

export interface ChartResult {
  meta: SymbolMeta;
  bars: Bar[];
}

function toMeta(symbol: string, m: Record<string, any>): SymbolMeta {
  const now = Date.now();
  const reg = m.currentTradingPeriod?.regular;
  const sessionStart = reg?.start ? reg.start * 1000 : null;
  const sessionEnd = reg?.end ? reg.end * 1000 : null;
  const marketTime = (m.regularMarketTime ?? 0) * 1000;
  const isOpen =
    sessionStart !== null && sessionEnd !== null && now >= sessionStart && now < sessionEnd &&
    // guard against stale data on exchange holidays
    now - marketTime < 30 * 60_000;
  const price = Number(m.regularMarketPrice ?? m.chartPreviousClose ?? 0);
  const prevClose = Number(m.previousClose ?? m.chartPreviousClose ?? price);
  return {
    symbol,
    name: m.longName || m.shortName || displaySymbol(symbol),
    exchange: m.fullExchangeName || exchangeOf(symbol),
    currency: m.currency || "INR",
    price,
    prevClose,
    dayHigh: m.regularMarketDayHigh ?? null,
    dayLow: m.regularMarketDayLow ?? null,
    volume: m.regularMarketVolume ?? null,
    fiftyTwoWeekHigh: m.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: m.fiftyTwoWeekLow ?? null,
    marketTime,
    sessionStart,
    sessionEnd,
    isOpen,
    firstTradeDate: m.firstTradeDate ? m.firstTradeDate * 1000 : null,
  };
}

export function fetchChart(p: ChartParams): Promise<ChartResult> {
  const qs = new URLSearchParams({ interval: p.interval, includePrePost: "false", events: "" });
  if (p.range) qs.set("range", p.range);
  else {
    qs.set("period1", String(Math.floor(p.period1 ?? 0)));
    qs.set("period2", String(Math.floor(p.period2 ?? Date.now() / 1000)));
  }
  const live = p.range !== undefined || (p.period2 ?? Infinity) > Date.now() / 1000 - 120;
  const key = `chart:${p.symbol}:${qs.toString()}`;
  return cached(key, live ? 1500 : 10 * 60_000, async () => {
    const json = await yahooJson<YahooChartResponse>(
      `/v8/finance/chart/${encodeURIComponent(p.symbol)}?${qs.toString()}`,
    );
    const r = json.chart.result?.[0];
    if (!r) throw new UpstreamError(json.chart.error?.description ?? "No data", 404);
    const q = r.indicators.quote[0] ?? { open: [], high: [], low: [], close: [], volume: [] };
    const ts = r.timestamp ?? [];
    const raw: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
      if (o == null || h == null || l == null || c == null) continue;
      raw.push({
        t: normalizeBarTime(ts[i] * 1000, p.interval),
        o: round(o), h: round(h), l: round(l), c: round(c),
        v: q.volume[i] ?? 0,
      });
    }
    raw.sort((a, b) => a.t - b.t);
    return { meta: toMeta(p.symbol, r.meta), bars: mergeDuplicateBars(raw) };
  });
}

/** Latest price + session info for one symbol */
export async function fetchMeta(symbol: string): Promise<SymbolMeta> {
  const { meta, bars } = await fetchChart({ symbol, interval: "1m", range: "1d" });
  const last = bars[bars.length - 1];
  if (!meta.price && last) meta.price = last.c;
  return meta;
}

// ---------------------------------------------------------------------------
// Quotes (watchlists) via the spark endpoint — many symbols per request
// ---------------------------------------------------------------------------

type SparkResponse = Record<
  string,
  { symbol: string; close: (number | null)[] | null; previousClose?: number; chartPreviousClose?: number; fulldayPrice?: number }
>;

export async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  const unique = Array.from(new Set(symbols)).slice(0, 200);
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 20) chunks.push(unique.slice(i, i + 20));
  const results = await Promise.all(
    chunks.map((chunk) =>
      cached(`spark:${chunk.join(",")}`, 2000, async () => {
        const qs = new URLSearchParams({ symbols: chunk.join(","), range: "1d", interval: "5m" });
        const json = await yahooJson<SparkResponse>(`/v8/finance/spark?${qs.toString()}`);
        return Object.values(json).map((s): Quote => {
          const closes = (s.close ?? []).filter((c): c is number => c != null);
          const price = round(s.fulldayPrice ?? closes[closes.length - 1] ?? s.chartPreviousClose ?? 0);
          const prevClose = round(s.previousClose ?? s.chartPreviousClose ?? price);
          const change = price - prevClose;
          return {
            symbol: s.symbol,
            price,
            prevClose,
            change: round(change),
            changePct: prevClose ? (change / prevClose) * 100 : 0,
            spark: downsample(closes, 40),
          };
        });
      }).catch(() => [] as Quote[]),
    ),
  );
  return results.flat();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface YahooSearchResponse {
  quotes: Array<{ symbol: string; shortname?: string; longname?: string; exchange?: string; quoteType?: string }>;
}

const ALLOWED_EXCHANGES = new Set(["NSI", "BSE"]);

export function searchSymbols(q: string): Promise<SearchResult[]> {
  return cached(`search:${q.toLowerCase()}`, 60 * 60_000, async () => {
    const qs = new URLSearchParams({ q, quotesCount: "20", newsCount: "0", listsCount: "0", enableFuzzyQuery: "true" });
    const json = await yahooJson<YahooSearchResponse>(`/v1/finance/search?${qs.toString()}`);
    return (json.quotes ?? [])
      .filter((r) => r.symbol && (ALLOWED_EXCHANGES.has(r.exchange ?? "") || r.symbol.startsWith("^") && r.symbol !== "^"))
      .filter((r) => r.symbol.startsWith("^") ? /NSE|NIFTY|SENSEX|BSE|INDIA/i.test(`${r.shortname} ${r.longname}`) || r.exchange === "NSI" || r.exchange === "BSE" : true)
      .map((r) => ({
        symbol: r.symbol,
        name: r.longname || r.shortname || r.symbol,
        exchange: r.exchange === "NSI" ? "NSE" : r.exchange === "BSE" ? "BSE" : "INDEX",
        type: r.quoteType ?? "EQUITY",
      }));
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function downsample(values: number[], max: number): number[] {
  if (values.length <= max) return values.map(round);
  const step = values.length / max;
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(round(values[Math.floor(i * step)]));
  out[out.length - 1] = round(values[values.length - 1]);
  return out;
}
