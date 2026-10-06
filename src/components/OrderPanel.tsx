"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Info, Minus, Plus } from "lucide-react";
import type { OrderType, Side, Validity } from "@/lib/types";
import { computeCharges } from "@/lib/charges";
import { displaySymbol, exchangeOf, isTradable, isWithinSessionHours } from "@/lib/market";
import { changeClass, fmtINR, fmtPct, fmtPrice, fmtQty, fmtSigned } from "@/lib/format";
import { livePrice, useApp } from "@/store/app";
import { placeOrder } from "@/store/actions";
import { Button, Segmented, Spinner, cn } from "./ui/primitives";

const ORDER_TYPES: { value: OrderType; label: string; title: string }[] = [
  { value: "MARKET", label: "Market", title: "Execute immediately at the best available price" },
  { value: "LIMIT", label: "Limit", title: "Execute at the limit price or better" },
  { value: "SL", label: "SL", title: "Stop-loss limit: becomes a limit order once the trigger is hit" },
  { value: "SL-M", label: "SL-M", title: "Stop-loss market: becomes a market order once the trigger is hit" },
];

export function OrderPanel({ onPlaced }: { onPlaced?: () => void }) {
  const symbol = useApp((s) => s.activeSymbol);
  const ticket = useApp((s) => s.ticket);
  const account = useApp((s) => s.account);
  const meta = useApp((s) => (s.activeMeta?.symbol === s.activeSymbol ? s.activeMeta : null));
  const ltp = useApp((s) => livePrice(s, s.activeSymbol));
  const quote = useApp((s) => s.quotes[s.activeSymbol]);
  const holding = useApp((s) => s.holdings.find((h) => h.symbol === s.activeSymbol) ?? null);
  const orders = useApp((s) => s.orders);

  const [side, setSide] = useState<Side>("BUY");
  const [type, setType] = useState<OrderType>("MARKET");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [trigger, setTrigger] = useState("");
  const [validity, setValidity] = useState<Validity>("DAY");
  const [byAmount, setByAmount] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCharges, setShowCharges] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);

  // Reset prices when switching symbols
  useEffect(() => {
    setPrice("");
    setTrigger("");
    setAmount("");
  }, [symbol]);

  // Prefill from "B"/"S" buttons, chart "+" and holdings actions
  useEffect(() => {
    if (!ticket) return;
    setSide(ticket.side);
    if (ticket.orderType) setType(ticket.orderType);
    if (ticket.qty) {
      setQty(String(ticket.qty));
      setByAmount(false);
    }
    if (ticket.price != null) setPrice(ticket.price.toFixed(2));
    if (ticket.trigger != null) setTrigger(ticket.trigger.toFixed(2));
    setTimeout(() => qtyRef.current?.focus(), 50);
  }, [ticket]);

  // Seed price fields with LTP when a priced order type is chosen
  useEffect(() => {
    if (!ltp) return;
    if ((type === "LIMIT" || type === "SL") && !price) setPrice(ltp.toFixed(2));
    if ((type === "SL" || type === "SL-M") && !trigger) setTrigger(ltp.toFixed(2));
    if (type === "MARKET" && validity === "GTC") setValidity("DAY");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, ltp != null]);

  // B / S hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      if (e.key === "b" || e.key === "B") {
        setSide("BUY");
        qtyRef.current?.focus();
        e.preventDefault();
      } else if (e.key === "s" || e.key === "S") {
        setSide("SELL");
        qtyRef.current?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tradable = isTradable(symbol);
  const marketOpen = meta ? meta.isOpen : isWithinSessionHours(Date.now());
  const execPrice =
    type === "MARKET" ? ltp ?? 0 : type === "SL-M" ? Number(trigger) || ltp || 0 : Number(price) || ltp || 0;

  const qtyNum = byAmount ? Math.floor((Number(amount) || 0) / (execPrice || Infinity)) : Math.floor(Number(qty) || 0);
  const value = qtyNum * execPrice;
  const charges = account?.simulate_charges === false ? null : computeCharges(side, value);
  const total = side === "BUY" ? value + (charges?.total ?? 0) : value - (charges?.total ?? 0);

  const reservedCash = useMemo(
    () =>
      orders
        .filter((o) => o.side === "BUY" && (o.status === "OPEN" || o.status === "TRIGGERED"))
        .reduce((s, o) => s + o.qty * (o.limit_price ?? o.trigger_price ?? o.ref_price ?? 0), 0),
    [orders],
  );
  const reservedQty = useMemo(
    () =>
      orders
        .filter((o) => o.symbol === symbol && o.side === "SELL" && (o.status === "OPEN" || o.status === "TRIGGERED"))
        .reduce((s, o) => s + o.qty, 0),
    [orders, symbol],
  );
  const availableCash = Math.max(0, (account?.cash ?? 0) - reservedCash);
  const availableQty = Math.max(0, (holding?.qty ?? 0) - reservedQty);
  const maxBuyQty = execPrice > 0 ? Math.floor(availableCash / (execPrice * 1.0012)) : 0;

  let problem: string | null = null;
  if (!qtyNum || qtyNum < 1) problem = byAmount ? "Amount is less than one share" : "Enter a quantity";
  else if ((type === "LIMIT" || type === "SL") && !(Number(price) > 0)) problem = "Enter a limit price";
  else if ((type === "SL" || type === "SL-M") && !(Number(trigger) > 0)) problem = "Enter a trigger price";
  else if (side === "BUY" && total > availableCash) problem = "Insufficient funds";
  else if (side === "SELL" && qtyNum > availableQty) problem = availableQty ? `You can sell up to ${availableQty}` : "You don't hold this stock";

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (problem || busy || !tradable) return;
    setBusy(true);
    const order = await placeOrder({
      symbol,
      side,
      orderType: type,
      qty: qtyNum,
      limitPrice: type === "LIMIT" || type === "SL" ? Number(price) : null,
      triggerPrice: type === "SL" || type === "SL-M" ? Number(trigger) : null,
      validity,
    });
    setBusy(false);
    if (order && order.status !== "REJECTED") onPlaced?.();
  }

  const change = quote ? quote.change : meta ? meta.price - meta.prevClose : null;
  const changePct = quote ? quote.changePct : meta && meta.prevClose ? ((meta.price - meta.prevClose) / meta.prevClose) * 100 : null;
  const buy = side === "BUY";

  return (
    <form onSubmit={submit} className="flex h-full min-h-0 flex-col bg-panel">
      {/* Header */}
      <div className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{displaySymbol(symbol)}</div>
            <div className="truncate text-[11px] text-faint">
              {exchangeOf(symbol)}
              {meta?.name ? ` · ${meta.name}` : ""}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="num text-[15px] font-semibold">{ltp ? fmtPrice(ltp) : "—"}</div>
            <div className={cn("num text-[11px]", changeClass(change))}>{change != null ? `${fmtSigned(change)} (${fmtPct(changePct)})` : ""}</div>
          </div>
        </div>
      </div>

      {!tradable ? (
        <div className="p-4 text-[13px] text-muted">
          <div className="rounded-lg border border-line bg-panel-2 p-4">
            <div className="font-medium text-fg">Indices can&apos;t be traded directly</div>
            <p className="mt-1 text-xs">Pick a stock or ETF (for example NIFTYBEES for NIFTY 50) to place orders.</p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Side */}
          <div className="grid grid-cols-2 border-b border-line">
            {(["BUY", "SELL"] as Side[]).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSide(s)}
                className={cn(
                  "relative h-10 text-[13px] font-semibold transition-colors",
                  side === s ? (s === "BUY" ? "text-up" : "text-down") : "text-muted hover:text-fg",
                )}
              >
                {s === "BUY" ? "Buy" : "Sell"}
                {side === s && <span className={cn("absolute inset-x-0 bottom-0 h-0.5", s === "BUY" ? "bg-up" : "bg-down")} />}
              </button>
            ))}
          </div>

          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Product</span>
              <span className="rounded bg-hover px-2 py-0.5 font-medium">Delivery (CNC)</span>
            </div>

            <div>
              <Label>Order type</Label>
              <Segmented
                className="w-full"
                value={type}
                onChange={setType}
                options={ORDER_TYPES.map((o) => ({ value: o.value, label: o.label, title: o.title }))}
              />
            </div>

            {/* Quantity */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="mb-0">{byAmount ? "Amount (₹)" : "Quantity"}</Label>
                <button type="button" onClick={() => setByAmount(!byAmount)} className="text-[11px] font-medium text-accent hover:underline">
                  {byAmount ? "Enter quantity" : "Enter amount"}
                </button>
              </div>
              {byAmount ? (
                <NumField value={amount} onChange={setAmount} placeholder="e.g. 50000" step={1000} min={0} />
              ) : (
                <NumField inputRef={qtyRef} value={qty} onChange={setQty} step={1} min={1} integer />
              )}
              <div className="mt-1 flex justify-between text-[11px] text-faint">
                <span>{byAmount ? `= ${fmtQty(qtyNum)} shares` : `≈ ${fmtINR(value)}`}</span>
                {buy ? (
                  <button type="button" className="hover:text-accent" onClick={() => { setByAmount(false); setQty(String(maxBuyQty)); }}>
                    Max {fmtQty(maxBuyQty)}
                  </button>
                ) : (
                  <button type="button" className="hover:text-accent" onClick={() => { setByAmount(false); setQty(String(availableQty)); }}>
                    Held {fmtQty(availableQty)}
                  </button>
                )}
              </div>
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price</Label>
                <NumField
                  value={type === "MARKET" || type === "SL-M" ? "" : price}
                  onChange={setPrice}
                  placeholder={type === "MARKET" || type === "SL-M" ? "Market" : ""}
                  disabled={type === "MARKET" || type === "SL-M"}
                  step={0.05}
                  min={0}
                />
              </div>
              <div>
                <Label>Trigger</Label>
                <NumField
                  value={type === "SL" || type === "SL-M" ? trigger : ""}
                  onChange={setTrigger}
                  placeholder="—"
                  disabled={!(type === "SL" || type === "SL-M")}
                  step={0.05}
                  min={0}
                />
              </div>
            </div>

            <div>
              <Label>Validity</Label>
              <Segmented
                className="w-full"
                value={validity}
                onChange={setValidity}
                options={[
                  { value: "DAY", label: "Day", title: "Cancelled automatically at the end of the session" },
                  { value: "GTC", label: "GTC", title: "Good till cancelled (up to 1 year)" },
                ]}
              />
              {type === "MARKET" && validity === "GTC" && <div className="mt-1 text-[11px] text-warn">Market orders are day-only.</div>}
            </div>

            {!marketOpen && (
              <div className="flex gap-2 rounded-md bg-warn/10 px-3 py-2 text-[11px] text-warn">
                <Info size={14} className="mt-px shrink-0" />
                <span>Market is closed. This will be an after-market order (AMO) processed at the next session&apos;s prices.</span>
              </div>
            )}

            {/* Summary */}
            <div className="space-y-1.5 rounded-lg border border-line bg-panel-2 p-3 text-xs">
              <Row label="Order value" value={fmtINR(value)} />
              {charges && (
                <>
                  <button type="button" onClick={() => setShowCharges(!showCharges)} className="flex w-full items-center justify-between text-muted hover:text-fg">
                    <span className="flex items-center gap-1">
                      Charges (est.) <ChevronDown size={12} className={cn("transition-transform", showCharges && "rotate-180")} />
                    </span>
                    <span className="num">{fmtINR(charges.total)}</span>
                  </button>
                  {showCharges && (
                    <div className="space-y-1 border-l border-line pl-2.5 text-[11px] text-faint">
                      <Row label="STT" value={fmtINR(charges.stt)} small />
                      <Row label="Exchange txn" value={fmtINR(charges.exchange)} small />
                      <Row label="SEBI fees" value={fmtINR(charges.sebi)} small />
                      <Row label="Stamp duty" value={fmtINR(charges.stamp)} small />
                      <Row label="GST" value={fmtINR(charges.gst)} small />
                      <Row label="DP charges" value={fmtINR(charges.dp)} small />
                    </div>
                  )}
                </>
              )}
              <div className="my-1 h-px bg-line" />
              <Row label={buy ? "Total cost" : "Net proceeds"} value={fmtINR(total)} strong />
              <Row label={buy ? "Available cash" : "Available qty"} value={buy ? fmtINR(availableCash) : fmtQty(availableQty)} />
            </div>
          </div>
        </div>
      )}

      {tradable && (
        <div className="shrink-0 border-t border-line p-3">
          {problem && qtyNum > 0 && <div className="mb-2 text-center text-[11px] text-down">{problem}</div>}
          <Button type="submit" variant={buy ? "buy" : "sell"} size="lg" className="w-full" disabled={!!problem || busy}>
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {buy ? "Buy" : "Sell"} {qtyNum > 0 ? fmtQty(qtyNum) : ""} {displaySymbol(symbol)}
          </Button>
          <div className="mt-1.5 text-center text-[10px] text-faint">Press B / S to switch side · Enter to place</div>
        </div>
      )}
    </form>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint", className)}>{children}</div>;
}

function Row({ label, value, strong, small }: { label: string; value: string; strong?: boolean; small?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong ? "font-semibold text-fg" : small ? "" : "text-muted")}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function NumField({
  value,
  onChange,
  step,
  min,
  placeholder,
  disabled,
  integer,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  step: number;
  min: number;
  placeholder?: string;
  disabled?: boolean;
  integer?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const bump = (dir: 1 | -1) => {
    const n = Number(value) || 0;
    const next = Math.max(min, n + dir * step);
    onChange(integer ? String(Math.round(next)) : next.toFixed(2));
  };
  return (
    <div className={cn("flex h-9 items-center rounded-md border border-line bg-panel focus-within:border-accent", disabled && "opacity-50")}>
      <button type="button" tabIndex={-1} disabled={disabled} onClick={() => bump(-1)} className="flex h-full w-8 items-center justify-center text-faint hover:text-fg">
        <Minus size={13} />
      </button>
      <input
        ref={inputRef}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="num h-full min-w-0 flex-1 bg-transparent text-center text-[13px] outline-none placeholder:text-faint"
      />
      <button type="button" tabIndex={-1} disabled={disabled} onClick={() => bump(1)} className="flex h-full w-8 items-center justify-center text-faint hover:text-fg">
        <Plus size={13} />
      </button>
    </div>
  );
}
