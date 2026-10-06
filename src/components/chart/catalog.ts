export type IndicatorCategory = "Trend" | "Momentum" | "Volatility" | "Volume" | "Other";

export interface IndicatorDef {
  name: string;
  label: string;
  category: IndicatorCategory;
  pane: "main" | "sub";
  params: number[];
  paramLabels: string[];
  description: string;
}

export const INDICATORS: IndicatorDef[] = [
  // Overlays on price
  { name: "EMA", label: "Exponential Moving Average", category: "Trend", pane: "main", params: [20, 50, 200], paramLabels: ["Length 1", "Length 2", "Length 3"], description: "Moving averages weighted toward recent prices." },
  { name: "MA", label: "Moving Average", category: "Trend", pane: "main", params: [20, 50], paramLabels: ["Length 1", "Length 2"], description: "Simple moving averages of closing price." },
  { name: "SMA", label: "Smoothed Moving Average", category: "Trend", pane: "main", params: [12, 2], paramLabels: ["Length", "Weight"], description: "Smoothed moving average." },
  { name: "WMA", label: "Weighted Moving Average", category: "Trend", pane: "main", params: [20], paramLabels: ["Length"], description: "Linearly weighted moving average." },
  { name: "BOLL", label: "Bollinger Bands", category: "Volatility", pane: "main", params: [20, 2], paramLabels: ["Length", "Std dev"], description: "Volatility bands around a moving average." },
  { name: "VWAP", label: "VWAP (session)", category: "Volume", pane: "main", params: [], paramLabels: [], description: "Volume-weighted average price, resets every session." },
  { name: "SUPERTREND", label: "SuperTrend", category: "Trend", pane: "main", params: [10, 3], paramLabels: ["ATR length", "Multiplier"], description: "ATR-based trailing trend line." },
  { name: "ICHIMOKU", label: "Ichimoku Cloud", category: "Trend", pane: "main", params: [9, 26, 52], paramLabels: ["Conversion", "Base", "Span B"], description: "Conversion, base, leading spans and lagging line." },
  { name: "DONCHIAN", label: "Donchian Channels", category: "Volatility", pane: "main", params: [20], paramLabels: ["Length"], description: "Highest high and lowest low over N bars." },
  { name: "KELTNER", label: "Keltner Channels", category: "Volatility", pane: "main", params: [20, 2, 10], paramLabels: ["EMA length", "Multiplier", "ATR length"], description: "EMA envelope sized by ATR." },
  { name: "SAR", label: "Parabolic SAR", category: "Trend", pane: "main", params: [2, 2, 20], paramLabels: ["Start (×0.01)", "Step (×0.01)", "Max (×0.01)"], description: "Stop-and-reverse trailing dots." },
  { name: "BBI", label: "Bull and Bear Index", category: "Trend", pane: "main", params: [3, 6, 12, 24], paramLabels: ["MA 1", "MA 2", "MA 3", "MA 4"], description: "Average of four moving averages." },
  { name: "AVP", label: "Average Price", category: "Other", pane: "main", params: [], paramLabels: [], description: "Cumulative average traded price." },

  // Oscillators
  { name: "VOL", label: "Volume", category: "Volume", pane: "sub", params: [20], paramLabels: ["MA length"], description: "Traded volume with moving average." },
  { name: "RSI", label: "Relative Strength Index", category: "Momentum", pane: "sub", params: [14], paramLabels: ["Length"], description: "Momentum oscillator between 0 and 100." },
  { name: "MACD", label: "MACD", category: "Momentum", pane: "sub", params: [12, 26, 9], paramLabels: ["Fast", "Slow", "Signal"], description: "Trend-following momentum indicator." },
  { name: "STOCH", label: "Stochastic", category: "Momentum", pane: "sub", params: [14, 3, 3], paramLabels: ["%K length", "%K smoothing", "%D smoothing"], description: "Close relative to the recent high-low range." },
  { name: "KDJ", label: "KDJ", category: "Momentum", pane: "sub", params: [9, 3, 3], paramLabels: ["Length", "K smoothing", "D smoothing"], description: "Stochastic with an extra J line." },
  { name: "ATR", label: "Average True Range", category: "Volatility", pane: "sub", params: [14], paramLabels: ["Length"], description: "Average size of each bar's range." },
  { name: "DMI", label: "DMI / ADX", category: "Trend", pane: "sub", params: [14, 6], paramLabels: ["DI length", "ADX smoothing"], description: "Directional movement and trend strength (ADX)." },
  { name: "CCI", label: "Commodity Channel Index", category: "Momentum", pane: "sub", params: [20], paramLabels: ["Length"], description: "Deviation of price from its average." },
  { name: "WR", label: "Williams %R", category: "Momentum", pane: "sub", params: [14], paramLabels: ["Length"], description: "Overbought / oversold oscillator." },
  { name: "ROC", label: "Rate of Change", category: "Momentum", pane: "sub", params: [12, 6], paramLabels: ["Length", "Signal"], description: "Percent change over N bars." },
  { name: "MTM", label: "Momentum", category: "Momentum", pane: "sub", params: [12, 6], paramLabels: ["Length", "Signal"], description: "Price difference over N bars." },
  { name: "AO", label: "Awesome Oscillator", category: "Momentum", pane: "sub", params: [5, 34], paramLabels: ["Fast", "Slow"], description: "Difference of 5 and 34 period midpoint SMAs." },
  { name: "TRIX", label: "TRIX", category: "Momentum", pane: "sub", params: [12, 9], paramLabels: ["Length", "Signal"], description: "Triple-smoothed EMA rate of change." },
  { name: "BIAS", label: "Bias", category: "Momentum", pane: "sub", params: [6, 12, 24], paramLabels: ["Length 1", "Length 2", "Length 3"], description: "Distance of price from its moving average." },
  { name: "PSY", label: "Psychological Line", category: "Momentum", pane: "sub", params: [12, 6], paramLabels: ["Length", "Signal"], description: "Share of up-closing bars." },
  { name: "OBV", label: "On Balance Volume", category: "Volume", pane: "sub", params: [30], paramLabels: ["MA length"], description: "Cumulative volume flow." },
  { name: "PVT", label: "Price Volume Trend", category: "Volume", pane: "sub", params: [], paramLabels: [], description: "Cumulative volume weighted by price change." },
  { name: "VR", label: "Volume Ratio", category: "Volume", pane: "sub", params: [26, 6], paramLabels: ["Length", "Signal"], description: "Up-volume vs down-volume ratio." },
  { name: "EMV", label: "Ease of Movement", category: "Volume", pane: "sub", params: [14, 9], paramLabels: ["Length", "Signal"], description: "Price change relative to volume." },
  { name: "BRAR", label: "BRAR", category: "Other", pane: "sub", params: [26], paramLabels: ["Length"], description: "Buying/selling sentiment indicator." },
  { name: "CR", label: "CR (Energy)", category: "Other", pane: "sub", params: [26, 10, 20, 40, 60], paramLabels: ["Length", "MA 1", "MA 2", "MA 3", "MA 4"], description: "Middle-price momentum." },
  { name: "DMA", label: "Different of MA", category: "Other", pane: "sub", params: [10, 50, 10], paramLabels: ["Short", "Long", "Signal"], description: "Difference between two moving averages." },
];

export function indicatorDef(name: string): IndicatorDef | undefined {
  return INDICATORS.find((i) => i.name === name);
}

export interface IndicatorConfig {
  id: string;
  name: string;
  pane: "main" | "sub";
  params: number[];
  visible: boolean;
}

export const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: "ind_ema", name: "EMA", pane: "main", params: [20, 50, 200], visible: true },
  { id: "ind_vol", name: "VOL", pane: "sub", params: [20], visible: true },
];

export type DrawingTool =
  | "segment"
  | "rayLine"
  | "straightLine"
  | "horizontalStraightLine"
  | "horizontalRayLine"
  | "horizontalSegment"
  | "verticalStraightLine"
  | "priceLine"
  | "pt_arrow"
  | "parallelStraightLine"
  | "priceChannelLine"
  | "fibonacciLine"
  | "pt_rect"
  | "pt_circle"
  | "pt_triangle"
  | "pt_text"
  | "simpleAnnotation"
  | "simpleTag"
  | "brush"
  | "pt_measure";

export const TOOL_LABELS: Record<DrawingTool, string> = {
  segment: "Trend line",
  rayLine: "Ray",
  straightLine: "Extended line",
  horizontalStraightLine: "Horizontal line",
  horizontalRayLine: "Horizontal ray",
  horizontalSegment: "Horizontal segment",
  verticalStraightLine: "Vertical line",
  priceLine: "Price line",
  pt_arrow: "Arrow",
  parallelStraightLine: "Parallel channel",
  priceChannelLine: "Price channel",
  fibonacciLine: "Fibonacci retracement",
  pt_rect: "Rectangle",
  pt_circle: "Circle",
  pt_triangle: "Triangle",
  pt_text: "Text",
  simpleAnnotation: "Annotation",
  simpleTag: "Price tag",
  brush: "Brush",
  pt_measure: "Measure",
};

export type ChartType = "candle_solid" | "candle_up_stroke" | "candle_stroke" | "ohlc" | "line" | "area";
export type ScaleType = "normal" | "logarithm" | "percentage";
export type MagnetMode = "normal" | "weak_magnet" | "strong_magnet";

export interface ChartPrefs {
  tf: string;
  chartType: ChartType;
  scale: ScaleType;
  indicators: IndicatorConfig[];
  showOrders: boolean;
  showPositions: boolean;
  showExecutions: boolean;
  showGrid: boolean;
  magnet: MagnetMode;
}

export const DEFAULT_PREFS: ChartPrefs = {
  tf: "1D",
  chartType: "candle_solid",
  scale: "normal",
  indicators: DEFAULT_INDICATORS,
  showOrders: true,
  showPositions: true,
  showExecutions: true,
  showGrid: true,
  magnet: "normal",
};
