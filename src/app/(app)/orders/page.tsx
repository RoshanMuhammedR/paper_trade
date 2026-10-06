"use client";

import { useMemo, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { displaySymbol } from "@/lib/market";
import { useApp } from "@/store/app";
import { runSync } from "@/store/actions";
import { OpenOrdersTable, OrderHistoryTable, TradesTable } from "@/components/tables";
import { Button, Input, Segmented, cn } from "@/components/ui/primitives";

type Tab = "open" | "history" | "trades";

export default function OrdersPage() {
  const orders = useApp((s) => s.orders);
  const trades = useApp((s) => s.trades);
  const [tab, setTab] = useState<Tab>("open");
  const [q, setQ] = useState("");
  const [side, setSide] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [syncing, setSyncing] = useState(false);

  const match = (symbol: string, s: "BUY" | "SELL") =>
    (side === "ALL" || side === s) && (!q.trim() || displaySymbol(symbol).toLowerCase().includes(q.trim().toLowerCase()));

  const open = useMemo(() => orders.filter((o) => (o.status === "OPEN" || o.status === "TRIGGERED") && match(o.symbol, o.side)), [orders, q, side]); // eslint-disable-line react-hooks/exhaustive-deps
  const history = useMemo(() => orders.filter((o) => o.status !== "OPEN" && o.status !== "TRIGGERED" && match(o.symbol, o.side)), [orders, q, side]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredTrades = useMemo(() => trades.filter((t) => match(t.symbol, t.side)), [trades, q, side]); // eslint-disable-line react-hooks/exhaustive-deps

  function exportCsv() {
    const header = ["executed_at", "symbol", "side", "qty", "price", "value", "charges", "avg_cost", "realized_pnl"];
    const lines = filteredTrades.map((t) =>
      [t.executed_at, t.symbol, t.side, t.qty, t.price, (t.qty * t.price).toFixed(2), t.charges, t.avg_cost ?? "", t.realized_pnl ?? ""].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `papertrade-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "open", label: "Open", count: open.length },
    { id: "history", label: "Order history", count: history.length },
    { id: "trades", label: "Trades", count: filteredTrades.length },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
            <p className="text-[13px] text-muted">Pending orders are checked against real market prices, even while the app is closed.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                await runSync();
                setSyncing(false);
              }}
            >
              <RefreshCw size={14} className={cn(syncing && "animate-spin")} /> Check pending orders
            </Button>
            {tab === "trades" && (
              <Button variant="outline" onClick={exportCsv} disabled={!filteredTrades.length}>
                <Download size={14} /> Export CSV
              </Button>
            )}
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
            <div className="flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium",
                    tab === t.id ? "bg-hover text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {t.label}
                  <span className="text-[11px] text-faint">{t.count}</span>
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                <Input placeholder="Filter symbol" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-44 pl-8" />
              </div>
              <Segmented
                size="sm"
                value={side}
                onChange={setSide}
                options={[
                  { value: "ALL", label: "All" },
                  { value: "BUY", label: "Buy" },
                  { value: "SELL", label: "Sell" },
                ]}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            {tab === "open" && <OpenOrdersTable orders={open} />}
            {tab === "history" && <OrderHistoryTable orders={history} />}
            {tab === "trades" && <TradesTable trades={filteredTrades} />}
          </div>
        </section>
      </div>
    </div>
  );
}
