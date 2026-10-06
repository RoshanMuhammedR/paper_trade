"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useApp } from "@/store/app";
import { HoldingsTable, OpenOrdersTable, OrderHistoryTable, TradesTable, useHoldingRows } from "./tables";
import { changeClass, fmtINR } from "@/lib/format";
import { IconButton, cn } from "./ui/primitives";

type Tab = "holdings" | "open" | "history" | "trades";

export function BottomPanel() {
  const orders = useApp((s) => s.orders);
  const trades = useApp((s) => s.trades);
  const rows = useHoldingRows();
  const [tab, setTab] = useState<Tab>("holdings");
  const [collapsed, setCollapsed] = useState(false);

  const open = useMemo(() => orders.filter((o) => o.status === "OPEN" || o.status === "TRIGGERED"), [orders]);
  const history = useMemo(() => orders.filter((o) => o.status !== "OPEN" && o.status !== "TRIGGERED").slice(0, 100), [orders]);
  const pnl = rows.reduce((s, r) => s + (r.pnl ?? 0), 0);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "holdings", label: "Holdings", count: rows.length },
    { id: "open", label: "Open orders", count: open.length },
    { id: "history", label: "Order history" },
    { id: "trades", label: "Trades" },
  ];

  return (
    <div className={cn("flex shrink-0 flex-col border-t border-line bg-panel", collapsed ? "h-10" : "h-[260px]")}>
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setCollapsed(false);
            }}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              tab === t.id && !collapsed ? "bg-hover text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className="rounded bg-accent-soft px-1 text-[10px] text-accent">{t.count}</span>}
          </button>
        ))}
        {rows.length > 0 && (
          <span className="ml-3 hidden text-xs text-muted sm:inline">
            Unrealised P&amp;L <span className={cn("num font-semibold", changeClass(pnl))}>{fmtINR(pnl, { sign: true })}</span>
          </span>
        )}
        <IconButton title={collapsed ? "Expand" : "Collapse"} className="ml-auto h-7 min-w-7" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </IconButton>
      </div>
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-auto border-t border-line">
          {tab === "holdings" && <HoldingsTable compact />}
          {tab === "open" && <OpenOrdersTable orders={open} />}
          {tab === "history" && <OrderHistoryTable orders={history} />}
          {tab === "trades" && <TradesTable trades={trades.slice(0, 200)} />}
        </div>
      )}
    </div>
  );
}
