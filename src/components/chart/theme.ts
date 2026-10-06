import type { DeepPartial, KLineData, Styles, TooltipFeatureStyle, NeighborData, Nullable } from "klinecharts";
import type { ChartType } from "./catalog";
import { UP, DOWN } from "./registry";

const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

const PALETTES = {
  dark: {
    bg: "#0b0e13",
    text: "#e3e7ee",
    muted: "#8a94a6",
    faint: "#5d6778",
    grid: "rgba(42,50,64,0.55)",
    line: "#232a36",
    cross: "#5d6778",
    crossBg: "#2a3240",
    accent: "#3d74ff",
    featureBg: "rgba(255,255,255,0.06)",
  },
  light: {
    bg: "#ffffff",
    text: "#131722",
    muted: "#6b7486",
    faint: "#9aa3b2",
    grid: "rgba(226,231,238,0.8)",
    line: "#e2e7ee",
    cross: "#9aa3b2",
    crossBg: "#131722",
    accent: "#2962ff",
    featureBg: "rgba(0,0,0,0.05)",
  },
};

export const INDICATOR_LINE_COLORS = ["#ff9800", "#2962ff", "#e91e63", "#00bcd4", "#9c27b0", "#8bc34a"];

function feature(id: string, code: string, color: string, bg: string, activeColor: string): TooltipFeatureStyle {
  return {
    id,
    position: "middle",
    type: "icon_font",
    content: { family: FONT, code },
    size: 11,
    color,
    activeColor,
    backgroundColor: "transparent",
    activeBackgroundColor: bg,
    borderRadius: 3,
    paddingLeft: 4,
    paddingRight: 4,
    paddingTop: 2,
    paddingBottom: 2,
    marginLeft: 2,
    marginRight: 0,
    marginTop: 0,
    marginBottom: 0,
  };
}

const fmt = (n: number | undefined) =>
  n == null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function chartStyles(theme: "dark" | "light", chartType: ChartType, showGrid: boolean): DeepPartial<Styles> {
  const c = PALETTES[theme];
  const candleType = chartType === "line" ? "area" : chartType;
  return {
    grid: {
      show: showGrid,
      horizontal: { color: c.grid, style: "solid" },
      vertical: { color: c.grid, style: "solid" },
    },
    candle: {
      type: candleType,
      bar: {
        compareRule: "current_open",
        upColor: UP,
        downColor: DOWN,
        noChangeColor: c.muted,
        upBorderColor: UP,
        downBorderColor: DOWN,
        noChangeBorderColor: c.muted,
        upWickColor: UP,
        downWickColor: DOWN,
        noChangeWickColor: c.muted,
      },
      area: {
        lineSize: 2,
        lineColor: c.accent,
        value: "close",
        smooth: false,
        backgroundColor:
          chartType === "line"
            ? [
                { offset: 0, color: "rgba(0,0,0,0)" },
                { offset: 1, color: "rgba(0,0,0,0)" },
              ]
            : [
                { offset: 0, color: theme === "dark" ? "rgba(61,116,255,0.01)" : "rgba(41,98,255,0.01)" },
                { offset: 1, color: theme === "dark" ? "rgba(61,116,255,0.28)" : "rgba(41,98,255,0.2)" },
              ],
        point: { show: true, color: c.accent, rippleColor: "rgba(61,116,255,0.3)", radius: 3, rippleRadius: 8, animation: true, animationDuration: 1000 },
      },
      priceMark: {
        show: true,
        high: { show: true, color: c.muted, textFamily: FONT, textSize: 10 },
        low: { show: true, color: c.muted, textFamily: FONT, textSize: 10 },
        last: {
          show: true,
          compareRule: "current_open",
          upColor: UP,
          downColor: DOWN,
          noChangeColor: c.muted,
          line: { show: true, style: "dashed", dashedValue: [4, 4], size: 1 },
          text: { show: true, family: FONT, size: 11, weight: 600, paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, borderRadius: 2, color: "#fff" },
        },
      },
      tooltip: {
        showRule: "always",
        showType: "standard",
        offsetLeft: 8,
        offsetTop: 6,
        offsetRight: 8,
        offsetBottom: 4,
        title: { show: false },
        legend: {
          size: 12,
          family: FONT,
          weight: 400,
          color: c.muted,
          marginLeft: 6,
          marginTop: 0,
          marginRight: 0,
          marginBottom: 0,
          defaultValue: "—",
          template: (data: NeighborData<Nullable<KLineData>>) => {
            const cur = data.current;
            if (!cur) return [];
            const prev = data.prev ?? cur;
            const change = cur.close - prev.close;
            const pct = prev.close ? (change / prev.close) * 100 : 0;
            const color = cur.close >= cur.open ? UP : DOWN;
            const chColor = change >= 0 ? UP : DOWN;
            return [
              { title: "O ", value: { text: fmt(cur.open), color } },
              { title: "H ", value: { text: fmt(cur.high), color } },
              { title: "L ", value: { text: fmt(cur.low), color } },
              { title: "C ", value: { text: fmt(cur.close), color } },
              { title: "", value: { text: `${change >= 0 ? "+" : ""}${fmt(change)} (${change >= 0 ? "+" : ""}${pct.toFixed(2)}%)`, color: chColor } },
              { title: "Vol ", value: { text: compactVolume(cur.volume), color: c.text } },
            ];
          },
        },
      },
    },
    indicator: {
      lines: INDICATOR_LINE_COLORS.map((color) => ({ style: "solid", smooth: false, size: 1.5, color, dashedValue: [2, 2] })),
      bars: [{ style: "fill", borderStyle: "solid", borderSize: 1, borderDashedValue: [2, 2], upColor: "rgba(34,171,148,0.55)", downColor: "rgba(247,82,95,0.55)", noChangeColor: c.muted }],
      lastValueMark: { show: false },
      tooltip: {
        showRule: "always",
        showType: "standard",
        offsetLeft: 8,
        offsetTop: 4,
        offsetRight: 8,
        offsetBottom: 4,
        title: { show: true, showName: true, showParams: true, size: 12, family: FONT, weight: 500, color: c.text, marginLeft: 0, marginTop: 0, marginRight: 6, marginBottom: 0 },
        legend: { size: 12, family: FONT, weight: 400, color: c.muted, marginLeft: 6, marginTop: 0, marginRight: 0, marginBottom: 0, defaultValue: "—" },
        features: [
          feature("visible", "◉", c.muted, c.featureBg, c.text),
          feature("setting", "⚙", c.muted, c.featureBg, c.text),
          feature("close", "✕", c.muted, c.featureBg, DOWN),
        ],
      },
    },
    xAxis: {
      axisLine: { show: true, color: c.line, size: 1 },
      tickLine: { show: false },
      tickText: { color: c.muted, family: FONT, size: 11, weight: 400 },
    },
    yAxis: {
      axisLine: { show: true, color: c.line, size: 1 },
      tickLine: { show: false },
      tickText: { color: c.muted, family: FONT, size: 11, weight: 400 },
    },
    separator: { size: 1, color: c.line, fill: true, activeBackgroundColor: "rgba(61,116,255,0.2)" },
    crosshair: {
      show: true,
      horizontal: {
        show: true,
        line: { show: true, style: "dashed", dashedValue: [4, 3], size: 1, color: c.cross },
        text: { show: true, color: "#fff", size: 11, family: FONT, weight: 500, backgroundColor: c.crossBg, borderColor: c.crossBg, borderRadius: 2, paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3 },
        features: [
          {
            ...feature("order", "+", "#fff", c.accent, "#fff"),
            position: "right",
            size: 14,
            backgroundColor: c.accent,
            activeBackgroundColor: c.accent,
            borderRadius: 3,
            paddingLeft: 5,
            paddingRight: 5,
            paddingTop: 1,
            paddingBottom: 1,
          },
        ],
      },
      vertical: {
        show: true,
        line: { show: true, style: "dashed", dashedValue: [4, 3], size: 1, color: c.cross },
        text: { show: true, color: "#fff", size: 11, family: FONT, weight: 500, backgroundColor: c.crossBg, borderColor: c.crossBg, borderRadius: 2, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3 },
      },
    },
    overlay: {
      point: { color: c.accent, borderColor: "rgba(61,116,255,0.35)", borderSize: 1, radius: 5, activeColor: c.accent, activeBorderColor: "rgba(61,116,255,0.35)", activeBorderSize: 3, activeRadius: 5 },
      line: { style: "solid", smooth: false, color: c.accent, size: 1.5, dashedValue: [4, 4] },
      rect: { style: "fill", color: "rgba(61,116,255,0.12)", borderColor: c.accent, borderSize: 1, borderRadius: 0, borderStyle: "solid", borderDashedValue: [2, 2] },
      polygon: { style: "fill", color: c.accent, borderColor: c.accent, borderSize: 1, borderStyle: "solid", borderDashedValue: [2, 2] },
      circle: { style: "fill", color: "rgba(61,116,255,0.12)", borderColor: c.accent, borderSize: 1, borderStyle: "solid", borderDashedValue: [2, 2] },
      text: { style: "fill", color: c.text, size: 12, family: FONT, weight: 400, borderStyle: "solid", borderDashedValue: [2, 2], borderSize: 0, borderRadius: 2, borderColor: c.accent, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, backgroundColor: "transparent" },
    },
  };
}

function compactVolume(v: number | undefined): string {
  if (v == null) return "—";
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

export function chartBackground(theme: "dark" | "light") {
  return theme === "dark" ? "#12161d" : "#ffffff";
}
