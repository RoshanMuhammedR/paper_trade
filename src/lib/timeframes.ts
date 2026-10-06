import type { Bar } from "./types";
import { IST_OFFSET_MS, SESSION_OPEN_MIN, istDayStart, istParts, istTime } from "./market";

export type YahooInterval = "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1wk" | "1mo" | "3mo";

export interface Timeframe {
  id: string;
  label: string;
  /** Interval requested from Yahoo */
  yahoo: YahooInterval;
  /** Number of Yahoo bars merged into one bar (intraday only) */
  agg: number;
  /** Bar length in minutes (intraday) — used for bucketing */
  minutes: number | null;
  period: { type: "minute" | "hour" | "day" | "week" | "month"; span: number };
  /** Days of history per request; null = whole history in one request */
  chunkDays: number | null;
  /** Yahoo only serves this many days back for the interval; null = unlimited */
  maxLookbackDays: number | null;
  /** Range used when polling for the live bar */
  liveRange: string;
  intraday: boolean;
}

const tf = (t: Omit<Timeframe, "intraday">): Timeframe => ({ ...t, intraday: t.minutes !== null });

export const TIMEFRAMES: Timeframe[] = [
  tf({ id: "1m", label: "1 minute", yahoo: "1m", agg: 1, minutes: 1, period: { type: "minute", span: 1 }, chunkDays: 4, maxLookbackDays: 29, liveRange: "1d" }),
  tf({ id: "2m", label: "2 minutes", yahoo: "2m", agg: 1, minutes: 2, period: { type: "minute", span: 2 }, chunkDays: 10, maxLookbackDays: 59, liveRange: "1d" }),
  tf({ id: "3m", label: "3 minutes", yahoo: "1m", agg: 3, minutes: 3, period: { type: "minute", span: 3 }, chunkDays: 6, maxLookbackDays: 29, liveRange: "1d" }),
  tf({ id: "5m", label: "5 minutes", yahoo: "5m", agg: 1, minutes: 5, period: { type: "minute", span: 5 }, chunkDays: 20, maxLookbackDays: 59, liveRange: "1d" }),
  tf({ id: "10m", label: "10 minutes", yahoo: "5m", agg: 2, minutes: 10, period: { type: "minute", span: 10 }, chunkDays: 30, maxLookbackDays: 59, liveRange: "1d" }),
  tf({ id: "15m", label: "15 minutes", yahoo: "15m", agg: 1, minutes: 15, period: { type: "minute", span: 15 }, chunkDays: 45, maxLookbackDays: 59, liveRange: "1d" }),
  tf({ id: "30m", label: "30 minutes", yahoo: "30m", agg: 1, minutes: 30, period: { type: "minute", span: 30 }, chunkDays: 59, maxLookbackDays: 59, liveRange: "1d" }),
  tf({ id: "1h", label: "1 hour", yahoo: "60m", agg: 1, minutes: 60, period: { type: "hour", span: 1 }, chunkDays: 180, maxLookbackDays: 729, liveRange: "1d" }),
  tf({ id: "2h", label: "2 hours", yahoo: "60m", agg: 2, minutes: 120, period: { type: "hour", span: 2 }, chunkDays: 365, maxLookbackDays: 729, liveRange: "1d" }),
  tf({ id: "4h", label: "4 hours", yahoo: "60m", agg: 4, minutes: 240, period: { type: "hour", span: 4 }, chunkDays: 729, maxLookbackDays: 729, liveRange: "1d" }),
  tf({ id: "1D", label: "1 day", yahoo: "1d", agg: 1, minutes: null, period: { type: "day", span: 1 }, chunkDays: 365 * 4, maxLookbackDays: null, liveRange: "5d" }),
  tf({ id: "1W", label: "1 week", yahoo: "1wk", agg: 1, minutes: null, period: { type: "week", span: 1 }, chunkDays: 365 * 15, maxLookbackDays: null, liveRange: "1mo" }),
  tf({ id: "1M", label: "1 month", yahoo: "1mo", agg: 1, minutes: null, period: { type: "month", span: 1 }, chunkDays: null, maxLookbackDays: null, liveRange: "3mo" }),
  tf({ id: "3M", label: "3 months", yahoo: "3mo", agg: 1, minutes: null, period: { type: "month", span: 3 }, chunkDays: null, maxLookbackDays: null, liveRange: "1y" }),
];

export const FAVORITE_TIMEFRAMES = ["1m", "5m", "15m", "1h", "1D", "1W"];

export function getTimeframe(id: string): Timeframe {
  return TIMEFRAMES.find((t) => t.id === id) ?? TIMEFRAMES.find((t) => t.id === "1D")!;
}

const DAY_MS = 86_400_000;

/** Normalises Yahoo timestamps of daily+ bars to IST midnight of the bucket start */
export function normalizeBarTime(t: number, interval: YahooInterval): number {
  switch (interval) {
    case "1d":
      return istDayStart(t);
    case "1wk": {
      const day = istDayStart(t);
      const wd = istParts(day + DAY_MS / 2).weekday; // 0 = Sun
      const offset = (wd + 6) % 7; // days since Monday
      return day - offset * DAY_MS;
    }
    case "1mo": {
      const p = istParts(t);
      return istTime(p.year, p.month, 1);
    }
    case "3mo": {
      const p = istParts(t);
      return istTime(p.year, Math.floor(p.month / 3) * 3, 1);
    }
    default:
      return t;
  }
}

/** Merge bars that share a timestamp (Yahoo appends a partial "live" row to weekly/monthly data) */
export function mergeDuplicateBars(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const last = out[out.length - 1];
    if (last && last.t === b.t) {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
      last.v = last.v + b.v;
    } else if (!last || b.t > last.t) {
      out.push({ ...b });
    }
  }
  return out;
}

/** Bucket intraday bars into larger bars aligned to the 09:15 IST session open */
export function aggregateIntraday(bars: Bar[], minutes: number): Bar[] {
  const span = minutes * 60_000;
  const out: Bar[] = [];
  for (const b of bars) {
    const sessionStart = istDayStart(b.t) + SESSION_OPEN_MIN * 60_000;
    const base = b.t >= sessionStart ? sessionStart : istDayStart(b.t);
    const bucket = base + Math.floor((b.t - base) / span) * span;
    const last = out[out.length - 1];
    if (last && last.t === bucket) {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
      last.v += b.v;
    } else {
      out.push({ t: bucket, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    }
  }
  return out;
}

/** Bar that contains time `t` for the given timeframe (used to place trade markers) */
export function bucketStart(t: number, tfr: Timeframe): number {
  if (tfr.minutes !== null) {
    const span = tfr.minutes * 60_000;
    const sessionStart = istDayStart(t) + SESSION_OPEN_MIN * 60_000;
    const base = t >= sessionStart ? sessionStart : istDayStart(t);
    return base + Math.floor((t - base) / span) * span;
  }
  return normalizeBarTime(t, tfr.yahoo);
}

export { IST_OFFSET_MS };
