"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  dispose,
  init,
  type Chart,
  type DataLoader,
  type KLineData,
  type Overlay,
  type OverlayEvent,
  type Period,
} from "klinecharts";
import type { Bar, Holding, Order, SymbolMeta, Trade } from "@/lib/types";
import { TIMEFRAMES, bucketStart, getTimeframe, type Timeframe } from "@/lib/timeframes";
import { displaySymbol } from "@/lib/market";
import { fmtPrice } from "@/lib/format";
import { loadDrawings, saveDrawings } from "@/store/data";
import { registerExtensions, UP, DOWN, type TradeLineData } from "./registry";
import { chartBackground, chartStyles } from "./theme";
import type { ChartPrefs, DrawingTool } from "./catalog";

export interface TradingChartHandle {
  screenshot: () => void;
  clearDrawings: () => void;
  scrollToRealtime: () => void;
  cancelDrawing: () => void;
}

export interface TradingChartProps {
  symbol: string;
  prefs: ChartPrefs;
  theme: "dark" | "light";
  activeTool: DrawingTool | null;
  drawingsLocked: boolean;
  drawingsVisible: boolean;
  orders: Order[];
  holding: Holding | null;
  trades: Trade[];
  ltp: number | null;
  onToolDone: () => void;
  onMeta: (meta: SymbolMeta) => void;
  onStatus: (s: { loading: boolean; error: string | null }) => void;
  onIndicatorFeature: (id: string, action: string) => void;
  onCrosshairOrder: (price: number) => void;
  onOrderDrag: (order: Order, price: number) => void;
  onOrderCancel: (order: Order) => void;
}

const DRAWINGS = "pt-drawings";
const TRADING = "pt-trading";

const toK = (b: Bar): KLineData => ({ timestamp: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });

function tfFromPeriod(p: Period): Timeframe {
  return TIMEFRAMES.find((t) => t.period.type === p.type && t.period.span === p.span) ?? getTimeframe("1D");
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

interface SavedDrawing {
  name: string;
  points: Array<{ timestamp?: number; value?: number }>;
  extendData?: unknown;
  lock?: boolean;
}

export const TradingChart = forwardRef<TradingChartHandle, TradingChartProps>(function TradingChart(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const keyRef = useRef("");
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const draggingRef = useRef(false);

  // drawings persistence
  const drawingSymbol = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressSave = useRef(false);
  const selectedOverlay = useRef<string | null>(null);
  const drawingOverlayId = useRef<string | null>(null);

  const prevSymbol = useRef<string | null>(null);
  const prevTf = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // Drawings helpers
  // -------------------------------------------------------------------------

  const serialize = (): SavedDrawing[] => {
    const chart = chartRef.current;
    if (!chart) return [];
    return chart
      .getOverlays({ groupId: DRAWINGS })
      .filter((o) => o.currentStep === -1)
      .map((o) => ({
        name: o.name,
        points: o.points.map((p) => ({ timestamp: p.timestamp, value: p.value })),
        extendData: o.extendData ?? null,
        lock: o.lock,
      }));
  };

  const flushSave = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (drawingSymbol.current) void saveDrawings(drawingSymbol.current, serialize());
    }
  };

  const scheduleSave = () => {
    if (suppressSave.current || !drawingSymbol.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const sym = drawingSymbol.current;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      if (drawingSymbol.current === sym) void saveDrawings(sym, serialize());
    }, 700);
  };

  const askText = (overlay: Overlay, isNew: boolean) => {
    const current = (overlay.extendData as { text?: string } | undefined)?.text ?? "";
    const text = window.prompt("Text", current);
    const chart = chartRef.current;
    if (!chart) return;
    if (text === null || text.trim() === "") {
      if (isNew) chart.removeOverlay({ id: overlay.id });
      return;
    }
    chart.overrideOverlay({ id: overlay.id, extendData: { text: text.slice(0, 200) } });
    scheduleSave();
  };

  const drawingEvents = {
    onDrawEnd: (e: OverlayEvent<unknown>) => {
      drawingOverlayId.current = null;
      if (e.overlay.name === "pt_text") askText(e.overlay, true);
      propsRef.current.onToolDone();
      scheduleSave();
    },
    onPressedMoveEnd: () => scheduleSave(),
    onRemoved: () => scheduleSave(),
    onSelected: (e: OverlayEvent<unknown>) => {
      selectedOverlay.current = e.overlay.id;
    },
    onDeselected: (e: OverlayEvent<unknown>) => {
      if (selectedOverlay.current === e.overlay.id) selectedOverlay.current = null;
    },
    onDoubleClick: (e: OverlayEvent<unknown>) => {
      if (e.overlay.name === "pt_text") askText(e.overlay, false);
    },
  };

  // -------------------------------------------------------------------------
  // Mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    registerExtensions();
    const el = containerRef.current!;
    const p = propsRef.current;
    const chart = init(el, {
      locale: "en-US",
      timezone: "Asia/Kolkata",
      styles: chartStyles(p.theme, p.prefs.chartType, p.prefs.showGrid),
      thousandsSeparator: { sign: "," },
      decimalFold: { threshold: 100 },
    });
    if (!chart) return;
    chartRef.current = chart;
    chart.setOffsetRightDistance(60);
    prevSymbol.current = null;
    prevTf.current = null;
    let alive = true;

    const stopLive = () => {
      if (liveTimer.current) clearTimeout(liveTimer.current);
      liveTimer.current = null;
    };

    const loader: DataLoader = {
      getBars: async ({ type, timestamp, symbol, period, callback }) => {
        const tf = tfFromPeriod(period);
        const key = `${symbol.ticker}|${tf.id}`;
        const stale = () => !alive || key !== keyRef.current;
        const base = `/api/market/candles?symbol=${encodeURIComponent(symbol.ticker)}&tf=${tf.id}`;
        if (type === "init") propsRef.current.onStatus({ loading: true, error: null });
        try {
          if (type === "init") {
            const res = await getJson<{ meta?: SymbolMeta; bars: Bar[]; more: boolean }>(base);
            if (stale()) return;
            callback(res.bars.map(toK), { forward: res.more, backward: false });
            if (res.meta) propsRef.current.onMeta(res.meta);
            propsRef.current.onStatus({ loading: false, error: res.bars.length ? null : "No price data for this timeframe" });
            setDataVersion((v) => v + 1);
          } else if (type === "forward" && timestamp) {
            const res = await getJson<{ bars: Bar[]; more: boolean }>(`${base}&to=${timestamp}`);
            if (stale()) return;
            callback(res.bars.map(toK), { forward: res.more, backward: false });
            setDataVersion((v) => v + 1);
          } else {
            callback([], { backward: false });
          }
        } catch (err) {
          if (stale()) return;
          if (type === "init") {
            callback([], false);
            propsRef.current.onStatus({ loading: false, error: (err as Error).message });
          } else {
            callback([], { forward: false });
          }
        }
      },
      subscribeBar: ({ symbol, period, callback }) => {
        stopLive();
        const tf = tfFromPeriod(period);
        const key = `${symbol.ticker}|${tf.id}`;
        const poll = async () => {
          if (!alive || key !== keyRef.current) return;
          let delay = 3000;
          if (!document.hidden) {
            try {
              const list = chartRef.current?.getDataList() ?? [];
              const since = list.length ? list[list.length - 1].timestamp : 0;
              const res = await getJson<{ meta: SymbolMeta; bars: Bar[] }>(
                `/api/market/candles?symbol=${encodeURIComponent(symbol.ticker)}&tf=${tf.id}&live=1&since=${since}`,
              );
              if (!alive || key !== keyRef.current) return;
              for (const b of res.bars) callback(toK(b));
              propsRef.current.onMeta(res.meta);
              delay = res.meta.isOpen ? 2000 : 30_000;
            } catch {
              delay = 10_000;
            }
          }
          liveTimer.current = setTimeout(poll, delay);
        };
        liveTimer.current = setTimeout(poll, 1000);
      },
      unsubscribeBar: () => stopLive(),
    };
    chart.setDataLoader(loader);

    chart.subscribeAction("onIndicatorTooltipFeatureClick", (data) => {
      const d = data as { indicator?: { id: string }; feature?: { id: string } };
      if (d.indicator && d.feature) propsRef.current.onIndicatorFeature(d.indicator.id, d.feature.id);
    });
    chart.subscribeAction("onCrosshairFeatureClick", (data) => {
      const d = data as { crosshair?: { y?: number; paneId?: string } };
      const y = d.crosshair?.y;
      if (y == null) return;
      const pt = chart.convertFromPixel([{ y }], { paneId: d.crosshair?.paneId ?? "candle_pane" }) as Array<{ value?: number }>;
      const value = Array.isArray(pt) ? pt[0]?.value : (pt as { value?: number }).value;
      if (value) propsRef.current.onCrosshairOrder(Math.round(value * 20) / 20);
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape" && drawingOverlayId.current) {
        chart.removeOverlay({ id: drawingOverlayId.current });
        drawingOverlayId.current = null;
        propsRef.current.onToolDone();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedOverlay.current) {
        const sel = chart.getOverlays({ id: selectedOverlay.current })[0];
        if (sel && sel.groupId === DRAWINGS) {
          chart.removeOverlay({ id: selectedOverlay.current });
          selectedOverlay.current = null;
        }
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
      stopLive();
      flushSave();
      dispose(el);
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Symbol / timeframe
  // -------------------------------------------------------------------------

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const tf = getTimeframe(props.prefs.tf);
    keyRef.current = `${props.symbol}|${tf.id}`;
    // Each setter reloads data, so only call the one(s) that changed
    if (prevTf.current !== tf.id) {
      prevTf.current = tf.id;
      chart.setPeriod(tf.period);
    }
    if (prevSymbol.current !== props.symbol) {
      prevSymbol.current = props.symbol;
      chart.setSymbol({ ticker: props.symbol, name: displaySymbol(props.symbol), pricePrecision: 2, volumePrecision: 0 });
    }
  }, [props.symbol, props.prefs.tf]);

  // Drawings for the symbol
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    flushSave();
    suppressSave.current = true;
    chart.removeOverlay({ groupId: DRAWINGS });
    suppressSave.current = false;
    selectedOverlay.current = null;
    drawingSymbol.current = props.symbol;
    let cancelled = false;
    loadDrawings(props.symbol).then((saved) => {
      if (cancelled || drawingSymbol.current !== props.symbol || !chartRef.current) return;
      suppressSave.current = true;
      for (const d of saved as SavedDrawing[]) {
        chartRef.current.createOverlay({
          name: d.name,
          groupId: DRAWINGS,
          points: d.points,
          extendData: d.extendData,
          lock: d.lock || propsRef.current.drawingsLocked,
          visible: propsRef.current.drawingsVisible,
          mode: propsRef.current.prefs.magnet,
          ...drawingEvents,
        });
      }
      suppressSave.current = false;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.symbol]);

  // -------------------------------------------------------------------------
  // Appearance
  // -------------------------------------------------------------------------

  useEffect(() => {
    chartRef.current?.setStyles(chartStyles(props.theme, props.prefs.chartType, props.prefs.showGrid));
  }, [props.theme, props.prefs.chartType, props.prefs.showGrid]);

  useEffect(() => {
    chartRef.current?.overrideYAxis({ paneId: "candle_pane", name: props.prefs.scale });
  }, [props.prefs.scale]);

  // Indicators: reconcile chart state with prefs
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const wanted = props.prefs.indicators;
    const existing = chart.getIndicators();
    for (const ind of existing) {
      if (!wanted.some((w) => w.id === ind.id)) chart.removeIndicator({ id: ind.id });
    }
    for (const cfg of wanted) {
      const cur = existing.find((e) => e.id === cfg.id);
      if (!cur) {
        chart.createIndicator(
          {
            id: cfg.id,
            name: cfg.name,
            calcParams: cfg.params,
            visible: cfg.visible,
            paneId: cfg.pane === "main" ? "candle_pane" : `pane_${cfg.id}`,
          },
          true,
        );
      } else if (JSON.stringify(cur.calcParams) !== JSON.stringify(cfg.params) || cur.visible !== cfg.visible) {
        chart.overrideIndicator({ id: cfg.id, name: cfg.name, calcParams: cfg.params, visible: cfg.visible });
      }
    }
  }, [props.prefs.indicators]);

  // Drawing tool activation
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (drawingOverlayId.current) {
      chart.removeOverlay({ id: drawingOverlayId.current });
      drawingOverlayId.current = null;
    }
    if (!props.activeTool) return;
    const id = chart.createOverlay({
      name: props.activeTool,
      groupId: DRAWINGS,
      mode: props.prefs.magnet,
      lock: false,
      visible: true,
      ...drawingEvents,
    });
    drawingOverlayId.current = typeof id === "string" ? id : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.activeTool]);

  useEffect(() => {
    chartRef.current?.overrideOverlay({
      groupId: DRAWINGS,
      lock: props.drawingsLocked,
      visible: props.drawingsVisible,
      mode: props.prefs.magnet,
    });
  }, [props.drawingsLocked, props.drawingsVisible, props.prefs.magnet]);

  // -------------------------------------------------------------------------
  // Trading overlays: open orders, position, executions
  // -------------------------------------------------------------------------

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || draggingRef.current) return;
    chart.removeOverlay({ groupId: TRADING });
    const list = chart.getDataList();
    if (!list.length) return;
    const last = list[list.length - 1].timestamp;
    const { prefs, holding, orders, trades, ltp } = props;

    if (prefs.showPositions && holding) {
      const pnl = ltp ? (ltp - holding.avg_price) * holding.qty : null;
      const label = `${holding.qty} @ ${fmtPrice(holding.avg_price)}${pnl != null ? `   P&L ${pnl >= 0 ? "+" : "-"}₹${fmtPrice(Math.abs(pnl))}` : ""}`;
      chart.createOverlay({
        name: "pt_hline",
        groupId: TRADING,
        lock: true,
        zLevel: 10,
        points: [{ timestamp: last, value: holding.avg_price }],
        extendData: { label, axisText: fmtPrice(holding.avg_price), color: pnl == null || pnl >= 0 ? UP : DOWN } satisfies TradeLineData,
      });
    }

    if (prefs.showOrders) {
      for (const o of orders) {
        const price = o.order_type === "LIMIT" ? o.limit_price : o.trigger_price ?? o.limit_price;
        if (price == null) continue;
        const typeLabel = o.order_type === "LIMIT" ? "LMT" : o.order_type === "SL" ? "SL" : o.order_type === "SL-M" ? "SL-M" : "MKT";
        const color = o.side === "BUY" ? "#2962ff" : "#f57c00";
        chart.createOverlay({
          name: "pt_hline",
          groupId: TRADING,
          lock: false,
          zLevel: 20,
          points: [{ timestamp: last, value: price }],
          extendData: {
            label: `${o.side} ${typeLabel} ${o.qty}${o.status === "TRIGGERED" ? " · TRIGGERED" : ""}`,
            axisText: fmtPrice(price),
            color,
            dashed: true,
            cancellable: true,
          } satisfies TradeLineData,
          onPressedMoveStart: () => {
            draggingRef.current = true;
          },
          onPressedMoveEnd: (e) => {
            draggingRef.current = false;
            const v = e.overlay.points[0]?.value;
            if (v != null) propsRef.current.onOrderDrag(o, Math.round(v * 20) / 20);
          },
          onClick: (e) => {
            if (e.figure?.key === "cancel") propsRef.current.onOrderCancel(o);
          },
        });
      }
    }

    if (prefs.showExecutions && trades.length) {
      const tf = getTimeframe(prefs.tf);
      const first = list[0].timestamp;
      for (const t of trades.slice(0, 300)) {
        const ts = bucketStart(Date.parse(t.executed_at), tf);
        if (ts < first || ts > last) continue;
        chart.createOverlay({
          name: "pt_trade",
          groupId: TRADING,
          lock: true,
          zLevel: 5,
          points: [{ timestamp: ts, value: t.price }],
          extendData: { side: t.side, text: `${t.side === "BUY" ? "B" : "S"} ${t.qty}` },
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.orders, props.holding, props.trades, props.ltp, props.prefs.showOrders, props.prefs.showPositions, props.prefs.showExecutions, props.prefs.tf, dataVersion]);

  // -------------------------------------------------------------------------
  // Imperative API
  // -------------------------------------------------------------------------

  useImperativeHandle(ref, () => ({
    screenshot: () => {
      const chart = chartRef.current;
      if (!chart) return;
      const url = chart.getConvertPictureUrl(true, "png", chartBackground(propsRef.current.theme));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${displaySymbol(propsRef.current.symbol)}_${propsRef.current.prefs.tf}_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    },
    clearDrawings: () => {
      chartRef.current?.removeOverlay({ groupId: DRAWINGS });
      scheduleSave();
    },
    scrollToRealtime: () => chartRef.current?.scrollToRealTime(200),
    cancelDrawing: () => {
      if (drawingOverlayId.current) {
        chartRef.current?.removeOverlay({ id: drawingOverlayId.current });
        drawingOverlayId.current = null;
      }
    },
  }));

  return <div ref={containerRef} className="h-full w-full" />;
});
