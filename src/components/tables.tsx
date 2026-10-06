"use client";

import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import type { Holding, Order, Trade } from "@/lib/types";
import { displaySymbol, exchangeOf } from "@/lib/market";
import { changeClass, fmtDateTime, fmtINR, fmtPct, fmtPrice, fmtQty, fmtSigned } from "@/lib/format";
import { openTicket, setActiveSymbol, useApp } from "@/store/app";
import { cancelOrder, modifyOrder } from "@/store/actions";
import { Badge, Button, Empty, Input, Modal, cn } from "./ui/primitives";

const th = "h-8 px-3 text-left text-[11px] font-medium uppercase tracking-wide text-faint whitespace-nowrap";
const td = "h-10 px-3 whitespace-nowrap";

function SymbolCell({ symbol, onClick }: { symbol: string; onClick?: () => void }) {
  return (
    <button onClick={onClick ?? (() => setActiveSymbol(symbol))} className="text-left hover:text-accent">
      <span className="font-medium">{displaySymbol(symbol)}</span>
      <span className="ml-1.5 text-[10px] text-faint">{exchangeOf(symbol)}</span>
    </button>
  );
}

function SideBadge({ side }: { side: "BUY" | "SELL" }) {
  return <Badge tone={side === "BUY" ? "up" : "down"}>{side}</Badge>;
}

export function StatusBadge({ order }: { order: Order }) {
  const tone =
    order.status === "EXECUTED" ? "up" : order.status === "REJECTED" ? "down" : order.status === "OPEN" || order.status === "TRIGGERED" ? "accent" : "neutral";
  return (
    <span title={order.status_message ?? undefined} className="inline-flex items-center gap-1">
      <Badge tone={tone}>{order.status}</Badge>
      {order.is_amo && (order.status === "OPEN" || order.status === "TRIGGERED") && <Badge tone="warn">AMO</Badge>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

export function useHoldingRows() {
  const holdings = useApp((s) => s.holdings);
  const quotes = useApp((s) => s.quotes);
  return holdings.map((h) => {
    const q = quotes[h.symbol];
    const ltp = q?.price ?? null;
    const invested = h.qty * h.avg_price;
    const current = ltp != null ? h.qty * ltp : null;
    const pnl = current != null ? current - invested : null;
    return {
      h,
      ltp,
      invested,
      current,
      pnl,
      pnlPct: pnl != null && invested ? (pnl / invested) * 100 : null,
      dayChange: q ? q.change * h.qty : null,
      dayChangePct: q?.changePct ?? null,
    };
  });
}

export function HoldingsTable({ compact = false }: { compact?: boolean }) {
  const rows = useHoldingRows();
  if (!rows.length) return <Empty title="No holdings yet">Stocks you buy will show up here with live P&amp;L.</Empty>;
  const tot = rows.reduce(
    (a, r) => ({ invested: a.invested + r.invested, current: a.current + (r.current ?? r.invested), day: a.day + (r.dayChange ?? 0) }),
    { invested: 0, current: 0, day: 0 },
  );
  const totPnl = tot.current - tot.invested;
  return (
    <table className="w-full text-[13px]">
      <thead className="sticky top-0 z-10 bg-panel">
        <tr className="border-b border-line">
          <th className={th}>Instrument</th>
          <th className={cn(th, "text-right")}>Qty</th>
          <th className={cn(th, "text-right")}>Avg cost</th>
          <th className={cn(th, "text-right")}>LTP</th>
          {!compact && <th className={cn(th, "text-right")}>Invested</th>}
          <th className={cn(th, "text-right")}>Cur. value</th>
          <th className={cn(th, "text-right")}>P&amp;L</th>
          <th className={cn(th, "text-right")}>Net chg</th>
          <th className={cn(th, "text-right")}>Day chg</th>
          <th className={th} />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.h.symbol} className="group border-b border-line/60 hover:bg-hover">
            <td className={td}>
              <SymbolCell symbol={r.h.symbol} />
            </td>
            <td className={cn(td, "num text-right")}>{fmtQty(r.h.qty)}</td>
            <td className={cn(td, "num text-right")}>{fmtPrice(r.h.avg_price)}</td>
            <td className={cn(td, "num text-right")}>{fmtPrice(r.ltp)}</td>
            {!compact && <td className={cn(td, "num text-right")}>{fmtINR(r.invested)}</td>}
            <td className={cn(td, "num text-right")}>{fmtINR(r.current)}</td>
            <td className={cn(td, "num text-right font-medium", changeClass(r.pnl))}>{fmtINR(r.pnl, { sign: true })}</td>
            <td className={cn(td, "num text-right", changeClass(r.pnlPct))}>{fmtPct(r.pnlPct)}</td>
            <td className={cn(td, "num text-right", changeClass(r.dayChangePct))}>{fmtPct(r.dayChangePct)}</td>
            <td className={cn(td, "w-px text-right")}>
              <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100">
                <Button size="sm" variant="buy" onClick={() => openTicket({ side: "BUY", symbol: r.h.symbol })}>
                  Add
                </Button>
                <Button size="sm" variant="sell" onClick={() => openTicket({ side: "SELL", symbol: r.h.symbol, qty: r.h.qty, orderType: "MARKET" })}>
                  Exit
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="bg-panel-2 font-medium">
          <td className={td}>Total</td>
          <td className={td} />
          <td className={td} />
          <td className={td} />
          {!compact && <td className={cn(td, "num text-right")}>{fmtINR(tot.invested)}</td>}
          <td className={cn(td, "num text-right")}>{fmtINR(tot.current)}</td>
          <td className={cn(td, "num text-right", changeClass(totPnl))}>{fmtINR(totPnl, { sign: true })}</td>
          <td className={cn(td, "num text-right", changeClass(totPnl))}>{fmtPct(tot.invested ? (totPnl / tot.invested) * 100 : 0)}</td>
          <td className={cn(td, "num text-right", changeClass(tot.day))}>{fmtINR(tot.day, { sign: true })}</td>
          <td className={td} />
        </tr>
      </tfoot>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function priceCell(o: Order) {
  if (o.status === "EXECUTED") return fmtPrice(o.filled_price);
  if (o.order_type === "MARKET" || o.order_type === "SL-M") return "MKT";
  return fmtPrice(o.limit_price);
}

export function OpenOrdersTable({ orders }: { orders: Order[] }) {
  const [editing, setEditing] = useState<Order | null>(null);
  const quotes = useApp((s) => s.quotes);
  if (!orders.length) return <Empty title="No open orders">Limit, stop-loss and after-market orders waiting to execute appear here.</Empty>;
  return (
    <>
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 z-10 bg-panel">
          <tr className="border-b border-line">
            <th className={th}>Time</th>
            <th className={th}>Side</th>
            <th className={th}>Instrument</th>
            <th className={th}>Type</th>
            <th className={cn(th, "text-right")}>Qty</th>
            <th className={cn(th, "text-right")}>Price</th>
            <th className={cn(th, "text-right")}>Trigger</th>
            <th className={cn(th, "text-right")}>LTP</th>
            <th className={th}>Validity</th>
            <th className={th}>Status</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="group border-b border-line/60 hover:bg-hover">
              <td className={cn(td, "text-muted")}>{fmtDateTime(o.created_at)}</td>
              <td className={td}>
                <SideBadge side={o.side} />
              </td>
              <td className={td}>
                <SymbolCell symbol={o.symbol} />
              </td>
              <td className={td}>{o.order_type}</td>
              <td className={cn(td, "num text-right")}>{fmtQty(o.qty)}</td>
              <td className={cn(td, "num text-right")}>{priceCell(o)}</td>
              <td className={cn(td, "num text-right")}>{o.trigger_price != null ? fmtPrice(o.trigger_price) : "—"}</td>
              <td className={cn(td, "num text-right text-muted")}>{fmtPrice(quotes[o.symbol]?.price)}</td>
              <td className={td}>{o.validity}</td>
              <td className={td}>
                <StatusBadge order={o} />
              </td>
              <td className={cn(td, "w-px")}>
                <div className="flex justify-end gap-1">
                  {o.order_type !== "MARKET" && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(o)}>
                      <Pencil size={12} /> Modify
                    </Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => void cancelOrder(o.id)}>
                    <X size={12} /> Cancel
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ModifyOrderDialog order={editing} onClose={() => setEditing(null)} />
    </>
  );
}

export function OrderHistoryTable({ orders }: { orders: Order[] }) {
  if (!orders.length) return <Empty title="No orders yet">Executed, cancelled, rejected and expired orders are listed here.</Empty>;
  return (
    <table className="w-full text-[13px]">
      <thead className="sticky top-0 z-10 bg-panel">
        <tr className="border-b border-line">
          <th className={th}>Time</th>
          <th className={th}>Side</th>
          <th className={th}>Instrument</th>
          <th className={th}>Type</th>
          <th className={cn(th, "text-right")}>Qty</th>
          <th className={cn(th, "text-right")}>Avg price</th>
          <th className={cn(th, "text-right")}>Charges</th>
          <th className={th}>Status</th>
          <th className={th}>Remarks</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} className="border-b border-line/60 hover:bg-hover">
            <td className={cn(td, "text-muted")}>{fmtDateTime(o.filled_at ?? o.updated_at)}</td>
            <td className={td}>
              <SideBadge side={o.side} />
            </td>
            <td className={td}>
              <SymbolCell symbol={o.symbol} />
            </td>
            <td className={td}>{o.order_type}</td>
            <td className={cn(td, "num text-right")}>{fmtQty(o.qty)}</td>
            <td className={cn(td, "num text-right")}>{priceCell(o)}</td>
            <td className={cn(td, "num text-right text-muted")}>{o.status === "EXECUTED" ? fmtPrice(o.charges) : "—"}</td>
            <td className={td}>
              <StatusBadge order={o} />
            </td>
            <td className={cn(td, "max-w-[280px] truncate text-xs text-muted")} title={o.status_message ?? undefined}>
              {o.status_message ?? ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TradesTable({ trades }: { trades: Trade[] }) {
  if (!trades.length) return <Empty title="No trades yet">Every execution is recorded here as your trade journal.</Empty>;
  return (
    <table className="w-full text-[13px]">
      <thead className="sticky top-0 z-10 bg-panel">
        <tr className="border-b border-line">
          <th className={th}>Executed</th>
          <th className={th}>Side</th>
          <th className={th}>Instrument</th>
          <th className={cn(th, "text-right")}>Qty</th>
          <th className={cn(th, "text-right")}>Price</th>
          <th className={cn(th, "text-right")}>Value</th>
          <th className={cn(th, "text-right")}>Avg cost</th>
          <th className={cn(th, "text-right")}>Realised P&amp;L</th>
          <th className={cn(th, "text-right")}>Charges</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t) => (
          <tr key={t.id} className="border-b border-line/60 hover:bg-hover">
            <td className={cn(td, "text-muted")}>{fmtDateTime(t.executed_at)}</td>
            <td className={td}>
              <SideBadge side={t.side} />
            </td>
            <td className={td}>
              <SymbolCell symbol={t.symbol} />
            </td>
            <td className={cn(td, "num text-right")}>{fmtQty(t.qty)}</td>
            <td className={cn(td, "num text-right")}>{fmtPrice(t.price)}</td>
            <td className={cn(td, "num text-right")}>{fmtINR(t.qty * t.price)}</td>
            <td className={cn(td, "num text-right text-muted")}>{t.avg_cost != null ? fmtPrice(t.avg_cost) : "—"}</td>
            <td className={cn(td, "num text-right font-medium", changeClass(t.realized_pnl))}>
              {t.realized_pnl != null ? fmtSigned(t.realized_pnl) : "—"}
            </td>
            <td className={cn(td, "num text-right text-muted")}>{fmtPrice(t.charges)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Modify dialog
// ---------------------------------------------------------------------------

export function ModifyOrderDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [trigger, setTrigger] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    setQty(String(order.qty));
    setPrice(order.limit_price != null ? String(order.limit_price) : "");
    setTrigger(order.trigger_price != null ? String(order.trigger_price) : "");
  }, [order]);

  if (!order) return null;
  const hasPrice = order.order_type === "LIMIT" || order.order_type === "SL";
  const hasTrigger = order.order_type === "SL" || order.order_type === "SL-M";

  async function save() {
    if (!order) return;
    setBusy(true);
    await modifyOrder(order.id, {
      qty: Math.floor(Number(qty)),
      limitPrice: hasPrice ? Number(price) : null,
      triggerPrice: hasTrigger ? Number(trigger) : null,
    });
    setBusy(false);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={380}
      title={
        <span className="flex items-center gap-2">
          Modify <SideBadge side={order.side} /> {displaySymbol(order.symbol)} <span className="text-xs font-normal text-faint">{order.order_type}</span>
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={order.side === "BUY" ? "buy" : "sell"} disabled={busy || !(Number(qty) > 0)} onClick={save}>
            Modify order
          </Button>
        </>
      }
    >
      <div className="space-y-3 p-4">
        <Field label="Quantity">
          <Input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        {hasPrice && (
          <Field label="Limit price">
            <Input type="number" min={0} step={0.05} value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        )}
        {hasTrigger && (
          <Field label="Trigger price">
            <Input type="number" min={0} step={0.05} value={trigger} onChange={(e) => setTrigger(e.target.value)} />
          </Field>
        )}
        <p className="text-[11px] text-faint">Modified orders are evaluated against prices from the moment of modification.</p>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">{label}</span>
      {children}
    </label>
  );
}
