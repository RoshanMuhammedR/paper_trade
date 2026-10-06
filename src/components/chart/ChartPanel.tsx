"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChartArea,
  ChartBar,
  ChartCandlestick,
  ChartLine,
  ChevronDown,
  ChevronsRight,
  Maximize2,
  Minimize2,
  PenLine,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { Order } from "@/lib/types";
import { FAVORITE_TIMEFRAMES, TIMEFRAMES } from "@/lib/timeframes";
import { displaySymbol, exchangeOf, isTradable } from "@/lib/market";
import { changeClass, fmtPct, fmtPrice, fmtSigned } from "@/lib/format";
import { openSearch, openTicket, useApp } from "@/store/app";
import { addToWatchlist, loadPrefs, savePrefs } from "@/store/data";
import { cancelOrder, describeOrder, modifyOrder } from "@/store/actions";
import { TradingChart, type TradingChartHandle } from "./TradingChart";
import { DrawingToolbar } from "./DrawingToolbar";
import { IndicatorDialog, IndicatorSettingsDialog } from "./IndicatorDialogs";
import { DEFAULT_PREFS, indicatorDef, type ChartPrefs, type ChartType, type DrawingTool, type ScaleType } from "./catalog";
import { IconButton, MenuItem, Popover, Spinner, Toggle, cn } from "../ui/primitives";

const CHART_TYPES: { value: ChartType; label: string; icon: React.ReactNode }[] = [
  { value: "candle_solid", label: "Candles", icon: <ChartCandlestick size={16} /> },
  { value: "candle_up_stroke", label: "Hollow candles", icon: <ChartCandlestick size={16} strokeWidth={1.4} /> },
  { value: "ohlc", label: "Bars (OHLC)", icon: <ChartBar size={16} /> },
  { value: "line", label: "Line", icon: <ChartLine size={16} /> },
  { value: "area", label: "Area", icon: <ChartArea size={16} /> },
];

const SCALES: { value: ScaleType; label: string }[] = [
  { value: "normal", label: "Linear" },
  { value: "logarithm", label: "Log" },
  { value: "percentage", label: "%" },
];

const PREFS_KEY = "pt-chart-prefs";

function readLocalPrefs(): ChartPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

export function ChartPanel({ toolbarLeft, toolbarRight }: { toolbarLeft?: React.ReactNode; toolbarRight?: React.ReactNode } = {}) {
  const [showTools, setShowTools] = useState(true);
  useEffect(() => {
    try {
      setShowTools(localStorage.getItem("pt-show-tools") !== "0");
    } catch {}
  }, []);
  const toggleTools = () => {
    setShowTools((v) => {
      try {
        localStorage.setItem("pt-show-tools", v ? "0" : "1");
      } catch {}
      return !v;
    });
  };
  const symbol = useApp((s) => s.activeSymbol);
  const theme = useApp((s) => s.theme);
  const meta = useApp((s) => s.activeMeta);
  const allOrders = useApp((s) => s.orders);
  const holdings = useApp((s) => s.holdings);
  const allTrades = useApp((s) => s.trades);
  const watchlistId = useApp((s) => s.activeWatchlistId);
  const inWatchlist = useApp((s) => s.watchlists.find((w) => w.id === s.activeWatchlistId)?.symbols.includes(s.activeSymbol));

  const [prefs, setPrefs] = useState<ChartPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [tool, setTool] = useState<DrawingTool | null>(null);
  const [locked, setLocked] = useState(false);
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  const [status, setStatus] = useState<{ loading: boolean; error: string | null }>({ loading: true, error: null });
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const chartRef = useRef<TradingChartHandle>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefs: local first for instant paint, then the account copy
  useEffect(() => {
    setPrefs(readLocalPrefs());
    setPrefsLoaded(true);
    loadPrefs<{ chart: ChartPrefs }>().then((p) => {
      if (p.chart) setPrefs({ ...DEFAULT_PREFS, ...p.chart });
    });
  }, []);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const updatePrefs = useCallback((patch: Partial<ChartPrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void savePrefs({ chart: next }), 1200);
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const orders = useMemo(
    () => allOrders.filter((o) => o.symbol === symbol && (o.status === "OPEN" || o.status === "TRIGGERED")),
    [allOrders, symbol],
  );
  const holding = useMemo(() => holdings.find((h) => h.symbol === symbol) ?? null, [holdings, symbol]);
  const trades = useMemo(() => allTrades.filter((t) => t.symbol === symbol), [allTrades, symbol]);
  const ltp = meta?.symbol === symbol ? meta.price : null;

  const addIndicator = (name: string) => {
    const def = indicatorDef(name);
    if (!def) return;
    updatePrefs({
      indicators: [...prefs.indicators, { id: `ind_${Date.now().toString(36)}`, name, pane: def.pane, params: def.params, visible: true }],
    });
  };
  const removeIndicator = (id: string) => updatePrefs({ indicators: prefs.indicators.filter((i) => i.id !== id) });

  const onIndicatorFeature = (id: string, action: string) => {
    const list = prefsRef.current.indicators;
    if (!list.some((i) => i.id === id)) return;
    if (action === "setting") setSettingsId(id);
    else if (action === "close") updatePrefs({ indicators: list.filter((i) => i.id !== id) });
    else if (action === "visible") updatePrefs({ indicators: list.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)) });
  };

  const onOrderDrag = useCallback((o: Order, price: number) => {
    if (o.order_type === "LIMIT") void modifyOrder(o.id, { qty: o.qty, limitPrice: price });
    else if (o.order_type === "SL-M") void modifyOrder(o.id, { qty: o.qty, triggerPrice: price });
    else if (o.order_type === "SL" && o.trigger_price != null && o.limit_price != null) {
      const delta = price - o.trigger_price;
      void modifyOrder(o.id, { qty: o.qty, triggerPrice: price, limitPrice: Math.round((o.limit_price + delta) * 100) / 100 });
    }
  }, []);

  const onOrderCancel = useCallback((o: Order) => {
    if (window.confirm(`Cancel order: ${describeOrder(o)}?`)) void cancelOrder(o.id);
  }, []);

  const onCrosshairOrder = useCallback(
    (price: number) => {
      const s = useApp.getState();
      if (!isTradable(s.activeSymbol)) return;
      const last = s.activeMeta?.price ?? price;
      openTicket({ side: price <= last ? "BUY" : "SELL", orderType: "LIMIT", price });
    },
    [],
  );

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panelRef.current?.requestFullscreen();
  };

  const settingsCfg = prefs.indicators.find((i) => i.id === settingsId) ?? null;
  const tfLabel = TIMEFRAMES.find((t) => t.id === prefs.tf)?.id ?? prefs.tf;
  const typeIcon = CHART_TYPES.find((c) => c.value === prefs.chartType)?.icon;
  const change = meta && meta.symbol === symbol ? meta.price - meta.prevClose : null;
  const changePct = meta && meta.symbol === symbol && meta.prevClose ? (change! / meta.prevClose) * 100 : null;

  return (
    <div ref={panelRef} className="flex h-full min-h-0 flex-col bg-panel">
      {/* Top toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-1.5">
        {toolbarLeft}
        <button
          onClick={() => openSearch("chart")}
          className="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 hover:bg-hover"
          title="Change symbol"
        >
          <Search size={14} className="text-faint" />
          <span className="text-[14px] font-semibold">{displaySymbol(symbol)}</span>
          <span className="text-[10px] font-medium text-faint">{exchangeOf(symbol)}</span>
        </button>
        {!inWatchlist && watchlistId && (
          <IconButton title="Add to watchlist" onClick={() => addToWatchlist(watchlistId, symbol)} className="h-7 min-w-7">
            <Plus size={15} />
          </IconButton>
        )}
        <div className="hidden shrink-0 items-baseline gap-2 px-2 sm:flex">
          <span className="num text-[14px] font-semibold">{ltp != null ? fmtPrice(ltp) : "—"}</span>
          <span className={cn("num text-xs font-medium", changeClass(change))}>
            {change != null ? `${fmtSigned(change)} (${fmtPct(changePct)})` : ""}
          </span>
        </div>

        <Divider />

        {FAVORITE_TIMEFRAMES.map((id) => (
          <button
            key={id}
            onClick={() => updatePrefs({ tf: id })}
            className={cn(
              "h-7 shrink-0 rounded-md px-2 text-[13px] font-medium transition-colors",
              prefs.tf === id ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover hover:text-fg",
            )}
          >
            {id}
          </button>
        ))}
        <Popover
          trigger={({ toggle, open }) => (
            <button
              onClick={toggle}
              className={cn(
                "flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-[13px] font-medium hover:bg-hover",
                !FAVORITE_TIMEFRAMES.includes(prefs.tf) ? "text-accent" : "text-muted",
                open && "bg-hover",
              )}
              title="All timeframes"
            >
              {!FAVORITE_TIMEFRAMES.includes(prefs.tf) && tfLabel}
              <ChevronDown size={14} />
            </button>
          )}
        >
          {(close) => (
            <div className="w-44">
              {TIMEFRAMES.map((t) => (
                <MenuItem
                  key={t.id}
                  active={prefs.tf === t.id}
                  hint={t.id}
                  onClick={() => {
                    updatePrefs({ tf: t.id });
                    close();
                  }}
                >
                  {t.label}
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>

        <Divider />

        <Popover
          trigger={({ toggle }) => (
            <IconButton title="Chart type" onClick={toggle}>
              {typeIcon}
            </IconButton>
          )}
        >
          {(close) =>
            CHART_TYPES.map((c) => (
              <MenuItem
                key={c.value}
                icon={c.icon}
                active={prefs.chartType === c.value}
                onClick={() => {
                  updatePrefs({ chartType: c.value });
                  close();
                }}
              >
                {c.label}
              </MenuItem>
            ))
          }
        </Popover>

        <button
          onClick={() => setIndicatorsOpen(true)}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted hover:bg-hover hover:text-fg"
        >
          <span className="font-serif text-[15px] italic">ƒx</span>
          <span className="hidden md:inline">Indicators</span>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <div className="mr-1 hidden items-center rounded-md border border-line p-0.5 md:flex">
            {SCALES.map((s) => (
              <button
                key={s.value}
                onClick={() => updatePrefs({ scale: s.value })}
                className={cn(
                  "h-6 rounded px-2 text-[11px] font-medium",
                  prefs.scale === s.value ? "bg-hover text-fg" : "text-faint hover:text-fg",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Popover
            align="right"
            trigger={({ toggle }) => (
              <IconButton title="Chart settings" onClick={toggle}>
                <SlidersHorizontal size={16} />
              </IconButton>
            )}
          >
            <div className="w-60 p-1">
              <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-faint">On chart</div>
              <SettingRow label="Open orders" checked={prefs.showOrders} onChange={(v) => updatePrefs({ showOrders: v })} />
              <SettingRow label="Position (avg price)" checked={prefs.showPositions} onChange={(v) => updatePrefs({ showPositions: v })} />
              <SettingRow label="Executions" checked={prefs.showExecutions} onChange={(v) => updatePrefs({ showExecutions: v })} />
              <SettingRow label="Grid lines" checked={prefs.showGrid} onChange={(v) => updatePrefs({ showGrid: v })} />
              <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-faint md:hidden">Scale</div>
              <div className="flex gap-1 px-2 md:hidden">
                {SCALES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => updatePrefs({ scale: s.value })}
                    className={cn("h-7 flex-1 rounded text-xs", prefs.scale === s.value ? "bg-accent-soft text-accent" : "bg-hover text-muted")}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </Popover>
          <IconButton title="Download chart image" onClick={() => chartRef.current?.screenshot()}>
            <Camera size={16} />
          </IconButton>
          <IconButton title={showTools ? "Hide drawing tools" : "Show drawing tools"} active={!showTools} onClick={toggleTools}>
            <PenLine size={16} />
          </IconButton>
          <IconButton title={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </IconButton>
          {toolbarRight}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {showTools && <DrawingToolbar
          activeTool={tool}
          onTool={setTool}
          magnet={prefs.magnet}
          onMagnet={(m) => updatePrefs({ magnet: m })}
          locked={locked}
          onLocked={setLocked}
          visible={drawingsVisible}
          onVisible={setDrawingsVisible}
          onClear={() => {
            if (window.confirm(`Remove all drawings on ${displaySymbol(symbol)}?`)) chartRef.current?.clearDrawings();
          }}
        />}
        <div className="relative min-w-0 flex-1">
          {prefsLoaded && (
            <TradingChart
              ref={chartRef}
              symbol={symbol}
              prefs={prefs}
              theme={theme}
              activeTool={tool}
              drawingsLocked={locked}
              drawingsVisible={drawingsVisible}
              orders={orders}
              holding={holding}
              trades={trades}
              ltp={ltp}
              onToolDone={() => setTool(null)}
              onMeta={(m) => useApp.setState({ activeMeta: m })}
              onStatus={setStatus}
              onIndicatorFeature={onIndicatorFeature}
              onCrosshairOrder={onCrosshairOrder}
              onOrderDrag={onOrderDrag}
              onOrderCancel={onOrderCancel}
            />
          )}
          {status.loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-md bg-panel/90 px-3 py-2 text-xs text-muted shadow-pop">
                <Spinner className="h-3.5 w-3.5" /> Loading {displaySymbol(symbol)}…
              </div>
            </div>
          )}
          {!status.loading && status.error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-xs rounded-lg border border-line bg-panel p-4 text-center shadow-pop">
                <div className="text-sm font-medium">Couldn&apos;t load {displaySymbol(symbol)}</div>
                <div className="mt-1 text-xs text-muted">{status.error}</div>
                <div className="mt-3 flex justify-center gap-2">
                  <button className="text-xs font-medium text-accent hover:underline" onClick={() => openSearch("chart")}>
                    Pick another symbol
                  </button>
                  {prefs.tf !== "1D" && (
                    <button className="text-xs font-medium text-accent hover:underline" onClick={() => updatePrefs({ tf: "1D" })}>
                      Switch to 1D
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {tool && (
            <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-panel/95 px-3 py-1 text-[11px] text-muted shadow-pop">
              Click on the chart to draw · Esc to cancel
            </div>
          )}
          <button
            onClick={() => chartRef.current?.scrollToRealtime()}
            title="Scroll to latest bar"
            className="absolute bottom-9 right-16 flex h-7 w-7 items-center justify-center rounded-md border border-line bg-panel text-muted shadow-sm hover:text-fg"
          >
            <ChevronsRight size={15} />
          </button>
        </div>
      </div>

      <IndicatorDialog
        open={indicatorsOpen}
        onClose={() => setIndicatorsOpen(false)}
        active={prefs.indicators}
        onAdd={addIndicator}
        onRemove={removeIndicator}
      />
      <IndicatorSettingsDialog
        config={settingsCfg}
        onClose={() => setSettingsId(null)}
        onSave={(params) => {
          updatePrefs({ indicators: prefs.indicators.map((i) => (i.id === settingsId ? { ...i, params } : i)) });
          setSettingsId(null);
        }}
      />
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex h-9 items-center justify-between rounded-md px-2 text-[13px] hover:bg-hover">
      <span>{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

