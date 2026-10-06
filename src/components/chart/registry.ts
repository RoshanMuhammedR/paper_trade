// Custom indicators and overlays registered on top of KLineChart's built-ins.
import { registerIndicator, registerOverlay, utils, type KLineData, type OverlayFigure } from "klinecharts";
import { istDayStart } from "@/lib/market";

export const UP = "#22ab94";
export const DOWN = "#f7525f";
const ACCENT = "#3d74ff";
const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function sma(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : undefined);
  }
  return out;
}

function ema(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  const k = 2 / (period + 1);
  let prev: number | undefined;
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      seed += values[i];
      out.push(undefined);
    } else if (i === period - 1) {
      seed += values[i];
      prev = seed / period;
      out.push(prev);
    } else {
      prev = values[i] * k + (prev as number) * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

function trueRange(list: KLineData[]): number[] {
  return list.map((d, i) => {
    if (i === 0) return d.high - d.low;
    const pc = list[i - 1].close;
    return Math.max(d.high - d.low, Math.abs(d.high - pc), Math.abs(d.low - pc));
  });
}

/** Wilder's smoothed ATR */
function atr(list: KLineData[], period: number): (number | undefined)[] {
  const tr = trueRange(list);
  const out: (number | undefined)[] = [];
  let prev: number | undefined;
  let seed = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      seed += tr[i];
      out.push(undefined);
    } else if (i === period - 1) {
      seed += tr[i];
      prev = seed / period;
      out.push(prev);
    } else {
      prev = ((prev as number) * (period - 1) + tr[i]) / period;
      out.push(prev);
    }
  }
  return out;
}

function highest(list: KLineData[], end: number, period: number) {
  let h = -Infinity;
  for (let j = Math.max(0, end - period + 1); j <= end; j++) h = Math.max(h, list[j].high);
  return h;
}
function lowest(list: KLineData[], end: number, period: number) {
  let l = Infinity;
  for (let j = Math.max(0, end - period + 1); j <= end; j++) l = Math.min(l, list[j].low);
  return l;
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

let registered = false;

export function registerExtensions() {
  if (registered) return;
  registered = true;

  registerIndicator<{ vwap?: number }>({
    name: "VWAP",
    shortName: "VWAP",
    series: "price",
    precision: 2,
    calcParams: [],
    figures: [{ key: "vwap", title: "VWAP: ", type: "line", styles: () => ({ color: "#ff9800" }) }],
    calc: (list) => {
      let day = -1;
      let pv = 0;
      let vol = 0;
      return list.map((d) => {
        const ds = istDayStart(d.timestamp);
        if (ds !== day) {
          day = ds;
          pv = 0;
          vol = 0;
        }
        const v = d.volume ?? 0;
        pv += ((d.high + d.low + d.close) / 3) * v;
        vol += v;
        return { vwap: vol > 0 ? pv / vol : undefined };
      });
    },
  });

  registerIndicator<{ up?: number; dn?: number }, number>({
    name: "SUPERTREND",
    shortName: "SuperTrend",
    series: "price",
    precision: 2,
    calcParams: [10, 3],
    figures: [
      { key: "up", title: "Up: ", type: "line", styles: () => ({ color: UP, size: 2 }) },
      { key: "dn", title: "Down: ", type: "line", styles: () => ({ color: DOWN, size: 2 }) },
    ],
    calc: (list, ind) => {
      const period = num(ind.calcParams[0], 10);
      const mult = num(ind.calcParams[1], 3);
      const a = atr(list, period);
      let finalUpper = 0;
      let finalLower = 0;
      let trend = 1;
      return list.map((d, i) => {
        const av = a[i];
        if (av === undefined) return {};
        const hl2 = (d.high + d.low) / 2;
        const basicUpper = hl2 + mult * av;
        const basicLower = hl2 - mult * av;
        const prevClose = i > 0 ? list[i - 1].close : d.close;
        const prevUpper = finalUpper || basicUpper;
        const prevLower = finalLower || basicLower;
        finalUpper = basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper;
        finalLower = basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower;
        if (trend === 1 && d.close < prevLower) trend = -1;
        else if (trend === -1 && d.close > prevUpper) trend = 1;
        return trend === 1 ? { up: finalLower } : { dn: finalUpper };
      });
    },
  });

  registerIndicator<{ atr?: number }, number>({
    name: "ATR",
    shortName: "ATR",
    precision: 2,
    calcParams: [14],
    figures: [{ key: "atr", title: "ATR: ", type: "line" }],
    calc: (list, ind) => atr(list, num(ind.calcParams[0], 14)).map((v) => ({ atr: v })),
  });

  registerIndicator<{ upper?: number; mid?: number; lower?: number }, number>({
    name: "DONCHIAN",
    shortName: "DC",
    series: "price",
    precision: 2,
    calcParams: [20],
    figures: [
      { key: "upper", title: "Upper: ", type: "line" },
      { key: "mid", title: "Mid: ", type: "line" },
      { key: "lower", title: "Lower: ", type: "line" },
    ],
    calc: (list, ind) => {
      const p = num(ind.calcParams[0], 20);
      return list.map((_, i) => {
        if (i < p - 1) return {};
        const upper = highest(list, i, p);
        const lower = lowest(list, i, p);
        return { upper, lower, mid: (upper + lower) / 2 };
      });
    },
  });

  registerIndicator<{ upper?: number; mid?: number; lower?: number }, number>({
    name: "KELTNER",
    shortName: "KC",
    series: "price",
    precision: 2,
    calcParams: [20, 2, 10],
    figures: [
      { key: "upper", title: "Upper: ", type: "line" },
      { key: "mid", title: "Mid: ", type: "line" },
      { key: "lower", title: "Lower: ", type: "line" },
    ],
    calc: (list, ind) => {
      const mid = ema(list.map((d) => d.close), num(ind.calcParams[0], 20));
      const mult = num(ind.calcParams[1], 2);
      const a = atr(list, num(ind.calcParams[2], 10));
      return list.map((_, i) => {
        const m = mid[i];
        const av = a[i];
        if (m === undefined || av === undefined) return {};
        return { mid: m, upper: m + mult * av, lower: m - mult * av };
      });
    },
  });

  registerIndicator<{ k?: number; d?: number }, number>({
    name: "STOCH",
    shortName: "Stoch",
    precision: 2,
    calcParams: [14, 3, 3],
    figures: [
      { key: "k", title: "%K: ", type: "line" },
      { key: "d", title: "%D: ", type: "line" },
    ],
    calc: (list, ind) => {
      const p = num(ind.calcParams[0], 14);
      const raw = list.map((d, i) => {
        const hh = highest(list, i, p);
        const ll = lowest(list, i, p);
        return hh === ll ? 50 : ((d.close - ll) / (hh - ll)) * 100;
      });
      const k = sma(raw, num(ind.calcParams[1], 3));
      const kFilled = k.map((v) => v ?? 50);
      const d = sma(kFilled, num(ind.calcParams[2], 3));
      return list.map((_, i) => (i < p - 1 ? {} : { k: k[i], d: k[i] === undefined ? undefined : d[i] }));
    },
  });

  registerIndicator<{ tenkan?: number; kijun?: number; spanA?: number; spanB?: number; chikou?: number }, number>({
    name: "ICHIMOKU",
    shortName: "Ichimoku",
    series: "price",
    precision: 2,
    calcParams: [9, 26, 52],
    figures: [
      { key: "tenkan", title: "Conv: ", type: "line", styles: () => ({ color: "#2962ff" }) },
      { key: "kijun", title: "Base: ", type: "line", styles: () => ({ color: "#b71c1c" }) },
      { key: "spanA", title: "Span A: ", type: "line", styles: () => ({ color: UP }) },
      { key: "spanB", title: "Span B: ", type: "line", styles: () => ({ color: DOWN }) },
      { key: "chikou", title: "Lagging: ", type: "line", styles: () => ({ color: "#9c27b0" }) },
    ],
    calc: (list, ind) => {
      const [t, k, s] = [num(ind.calcParams[0], 9), num(ind.calcParams[1], 26), num(ind.calcParams[2], 52)];
      const out: Array<{ tenkan?: number; kijun?: number; spanA?: number; spanB?: number; chikou?: number }> = list.map(() => ({}));
      list.forEach((d, i) => {
        const tenkan = i >= t - 1 ? (highest(list, i, t) + lowest(list, i, t)) / 2 : undefined;
        const kijun = i >= k - 1 ? (highest(list, i, k) + lowest(list, i, k)) / 2 : undefined;
        out[i].tenkan = tenkan;
        out[i].kijun = kijun;
        if (i + k < list.length) {
          if (tenkan !== undefined && kijun !== undefined) out[i + k].spanA = (tenkan + kijun) / 2;
          if (i >= s - 1) out[i + k].spanB = (highest(list, i, s) + lowest(list, i, s)) / 2;
        }
        if (i - k >= 0) out[i - k].chikou = d.close;
      });
      return out;
    },
  });

  registerIndicator<{ wma?: number }, number>({
    name: "WMA",
    shortName: "WMA",
    series: "price",
    precision: 2,
    calcParams: [20],
    figures: [{ key: "wma", title: "WMA: ", type: "line" }],
    calc: (list, ind) => {
      const p = num(ind.calcParams[0], 20);
      const denom = (p * (p + 1)) / 2;
      return list.map((_, i) => {
        if (i < p - 1) return {};
        let s = 0;
        for (let j = 0; j < p; j++) s += list[i - j].close * (p - j);
        return { wma: s / denom };
      });
    },
  });

  // -------------------------------------------------------------------------
  // Drawing tools
  // -------------------------------------------------------------------------

  registerOverlay({
    name: "pt_rect",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      return [
        {
          type: "polygon",
          attrs: { coordinates: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] },
          styles: { style: "stroke_fill", color: "rgba(61,116,255,0.12)", borderColor: ACCENT, borderSize: 1 },
        },
      ];
    },
  });

  registerOverlay({
    name: "pt_circle",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      return [{ type: "circle", attrs: { x: a.x, y: a.y, r }, styles: { style: "stroke_fill", color: "rgba(156,39,176,0.12)", borderColor: "#9c27b0", borderSize: 1 } }];
    },
  });

  registerOverlay({
    name: "pt_triangle",
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      if (coordinates.length === 2) return [{ type: "line", attrs: { coordinates } }];
      return [{ type: "polygon", attrs: { coordinates }, styles: { style: "stroke_fill", color: "rgba(255,152,0,0.12)", borderColor: "#ff9800", borderSize: 1 } }];
    },
  });

  registerOverlay({
    name: "pt_arrow",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const len = 12;
      const h1 = { x: b.x - len * Math.cos(ang - Math.PI / 7), y: b.y - len * Math.sin(ang - Math.PI / 7) };
      const h2 = { x: b.x - len * Math.cos(ang + Math.PI / 7), y: b.y - len * Math.sin(ang + Math.PI / 7) };
      return [
        { type: "line", attrs: { coordinates: [a, b] }, styles: { size: 2 } },
        { type: "line", attrs: { coordinates: [h1, b, h2] }, styles: { size: 2 } },
      ];
    },
  });

  registerOverlay<{ text?: string }>({
    name: "pt_text",
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay }) => {
      const text = overlay.extendData?.text || "Text";
      return [
        {
          type: "text",
          attrs: { x: coordinates[0].x, y: coordinates[0].y, text, align: "left", baseline: "bottom" },
          styles: { color: "#e3e7ee", size: 14, family: FONT, weight: 500, backgroundColor: "rgba(61,116,255,0.85)", borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4 },
        },
      ];
    },
  });

  registerOverlay({
    name: "pt_measure",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const [p0, p1] = overlay.points;
      const v0 = p0?.value ?? 0;
      const v1 = p1?.value ?? 0;
      const diff = v1 - v0;
      const pct = v0 ? (diff / v0) * 100 : 0;
      const bars = (p1?.dataIndex ?? 0) - (p0?.dataIndex ?? 0);
      const up = diff >= 0;
      const color = up ? UP : DOWN;
      const fill = up ? "rgba(34,171,148,0.16)" : "rgba(247,82,95,0.16)";
      const text = `${up ? "+" : ""}${diff.toFixed(2)} (${up ? "+" : ""}${pct.toFixed(2)}%)  ·  ${bars} bars`;
      const midX = (a.x + b.x) / 2;
      const figures: OverlayFigure[] = [
        { type: "polygon", attrs: { coordinates: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] }, styles: { style: "fill", color: fill } },
        { type: "line", attrs: { coordinates: [{ x: midX, y: a.y }, { x: midX, y: b.y }] }, styles: { color, size: 1 } },
        {
          type: "text",
          attrs: { x: midX, y: up ? Math.min(a.y, b.y) - 6 : Math.max(a.y, b.y) + 6, text, align: "center", baseline: up ? "bottom" : "top" },
          styles: { color: "#fff", size: 12, family: FONT, backgroundColor: color, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3 },
          ignoreEvent: true,
        },
      ];
      return figures;
    },
  });

  // -------------------------------------------------------------------------
  // Trading overlays (orders, positions, executions)
  // -------------------------------------------------------------------------

  registerOverlay<TradeLineData>({
    name: "pt_hline",
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const d = overlay.extendData;
      if (!d || !coordinates[0]) return [];
      const y = coordinates[0].y;
      const labelStyles = {
        style: "fill",
        color: "#fff",
        size: 11,
        family: FONT,
        weight: 600,
        backgroundColor: d.color,
        borderRadius: 3,
        paddingLeft: 6,
        paddingRight: 6,
        paddingTop: 3,
        paddingBottom: 3,
      };
      const figures: OverlayFigure[] = [
        {
          type: "line",
          attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
          styles: { style: d.dashed ? "dashed" : "solid", color: d.color, size: 1, dashedValue: [5, 4] },
        },
        { type: "text", key: "label", attrs: { x: 8, y, text: d.label, align: "left", baseline: "middle" }, styles: labelStyles },
      ];
      if (d.cancellable) {
        const w = utils.calcTextWidth(d.label, 11, 600, FONT) + 12;
        figures.push({
          type: "text",
          key: "cancel",
          attrs: { x: 8 + w + 3, y, text: "✕", align: "left", baseline: "middle" },
          styles: { ...labelStyles, backgroundColor: "rgba(0,0,0,0.55)" },
        });
      }
      return figures;
    },
    createYAxisFigures: ({ coordinates, overlay }) => {
      const d = overlay.extendData;
      if (!d || !coordinates[0]) return [];
      return [
        {
          type: "text",
          attrs: { x: 0, y: coordinates[0].y, text: d.axisText, align: "left", baseline: "middle" },
          styles: { style: "fill", color: "#fff", size: 11, family: FONT, weight: 600, backgroundColor: d.color, borderRadius: 2, paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3 },
          ignoreEvent: true,
        },
      ];
    },
  });

  registerOverlay<{ side: "BUY" | "SELL"; text: string }>({
    name: "pt_trade",
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay }) => {
      const d = overlay.extendData;
      const c = coordinates[0];
      if (!d || !c) return [];
      const buy = d.side === "BUY";
      const color = buy ? UP : DOWN;
      const s = 6;
      const tri = buy
        ? [{ x: c.x, y: c.y + 2 }, { x: c.x - s, y: c.y + 2 + s * 1.4 }, { x: c.x + s, y: c.y + 2 + s * 1.4 }]
        : [{ x: c.x, y: c.y - 2 }, { x: c.x - s, y: c.y - 2 - s * 1.4 }, { x: c.x + s, y: c.y - 2 - s * 1.4 }];
      return [
        { type: "polygon", attrs: { coordinates: tri }, styles: { style: "fill", color }, ignoreEvent: true },
        {
          type: "text",
          attrs: { x: c.x, y: buy ? c.y + 4 + s * 1.4 : c.y - 4 - s * 1.4, text: d.text, align: "center", baseline: buy ? "top" : "bottom" },
          styles: { color: "#fff", size: 10, family: FONT, weight: 600, backgroundColor: color, borderRadius: 3, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2 },
          ignoreEvent: true,
        },
      ];
    },
  });
}

export interface TradeLineData {
  label: string;
  axisText: string;
  color: string;
  dashed?: boolean;
  cancellable?: boolean;
}
