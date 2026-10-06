"use client";

import { useEffect, useMemo, useState } from "react";
import type { EquitySnapshot } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { IST_OFFSET_MS, displaySymbol } from "@/lib/market";
import { changeClass, fmtINR, fmtPct, fmtQty } from "@/lib/format";
import { useApp } from "@/store/app";
import { EquityChart, type EquityPoint } from "@/components/EquityChart";
import { HoldingsTable, useHoldingRows } from "@/components/tables";
import { cn } from "@/components/ui/primitives";

const ALLOC_COLORS = ["#3d74ff", "#22ab94", "#ff9800", "#e91e63", "#9c27b0", "#00bcd4", "#8bc34a", "#ff5722", "#607d8b", "#ffc107"];

export default function PortfolioPage() {
  const account = useApp((s) => s.account);
  const trades = useApp((s) => s.trades);
  const rows = useHoldingRows();
  const [snapshots, setSnapshots] = useState<EquitySnapshot[]>([]);

  useEffect(() => {
    supabaseBrowser()
      .from("pt_equity_snapshots")
      .select("*")
      .order("day", { ascending: true })
      .limit(2000)
      .then(({ data }: { data: EquitySnapshot[] | null }) => setSnapshots(data ?? []));
  }, []);

  const cash = account?.cash ?? 0;
  const invested = rows.reduce((s, r) => s + r.invested, 0);
  const current = rows.reduce((s, r) => s + (r.current ?? r.invested), 0);
  const unrealised = current - invested;
  const dayPnl = rows.reduce((s, r) => s + (r.dayChange ?? 0), 0);
  const equity = cash + current;
  const start = account?.starting_cash ?? 0;
  const totalReturn = equity - start;
  const totalReturnPct = start ? (totalReturn / start) * 100 : 0;

  const curve: EquityPoint[] = useMemo(() => {
    const pts: EquityPoint[] = [];
    if (account) pts.push({ t: Date.parse(account.reset_at), equity: account.starting_cash });
    // Today's point comes from live prices instead of the stored snapshot
    const today = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
    for (const s of snapshots) {
      if (s.day !== today) pts.push({ t: Date.parse(`${s.day}T15:30:00+05:30`), equity: s.equity });
    }
    if (account) pts.push({ t: Date.now(), equity });
    return pts.sort((a, b) => a.t - b.t);
  }, [snapshots, account, equity]);

  const stats = useMemo(() => {
    const closed = trades.filter((t) => t.side === "SELL" && t.realized_pnl != null);
    const wins = closed.filter((t) => (t.realized_pnl ?? 0) > 0);
    const losses = closed.filter((t) => (t.realized_pnl ?? 0) < 0);
    const grossWin = wins.reduce((s, t) => s + (t.realized_pnl ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.realized_pnl ?? 0), 0));
    const best = closed.reduce<typeof closed[number] | null>((b, t) => (!b || (t.realized_pnl ?? 0) > (b.realized_pnl ?? 0) ? t : b), null);
    const worst = closed.reduce<typeof closed[number] | null>((b, t) => (!b || (t.realized_pnl ?? 0) < (b.realized_pnl ?? 0) ? t : b), null);
    const bySymbol = new Map<string, number>();
    for (const t of closed) bySymbol.set(t.symbol, (bySymbol.get(t.symbol) ?? 0) + (t.realized_pnl ?? 0));
    return {
      closed: closed.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : null,
      avgWin: wins.length ? grossWin / wins.length : null,
      avgLoss: losses.length ? -grossLoss / losses.length : null,
      profitFactor: grossLoss ? grossWin / grossLoss : null,
      best,
      worst,
      bySymbol: Array.from(bySymbol.entries()).sort((a, b) => b[1] - a[1]),
      buys: trades.filter((t) => t.side === "BUY").length,
    };
  }, [trades]);

  const allocation = useMemo(() => {
    const items = rows
      .map((r) => ({ label: displaySymbol(r.h.symbol), value: r.current ?? r.invested }))
      .sort((a, b) => b.value - a.value);
    const top = items.slice(0, 9);
    const rest = items.slice(9).reduce((s, i) => s + i.value, 0);
    if (rest > 0) top.push({ label: "Others", value: rest });
    top.push({ label: "Cash", value: cash });
    const total = top.reduce((s, i) => s + i.value, 0) || 1;
    return top.map((i, idx) => ({ ...i, pct: (i.value / total) * 100, color: i.label === "Cash" ? "var(--line-strong)" : ALLOC_COLORS[idx % ALLOC_COLORS.length] }));
  }, [rows, cash]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Portfolio</h1>
            <p className="text-[13px] text-muted">Delivery holdings valued at live prices.</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total equity" value={fmtINR(equity)} sub={<span className={changeClass(totalReturn)}>{fmtINR(totalReturn, { sign: true })} ({fmtPct(totalReturnPct)}) all time</span>} big />
          <Stat label="Available cash" value={fmtINR(cash)} sub={`Starting capital ${fmtINR(start, { decimals: false })}`} />
          <Stat
            label="Unrealised P&L"
            value={<span className={changeClass(unrealised)}>{fmtINR(unrealised, { sign: true })}</span>}
            sub={`Invested ${fmtINR(invested, { decimals: false })} · Current ${fmtINR(current, { decimals: false })}`}
          />
          <Stat
            label="Realised P&L"
            value={<span className={changeClass(account?.realized_pnl)}>{fmtINR(account?.realized_pnl, { sign: true })}</span>}
            sub={
              <>
                Today <span className={changeClass(dayPnl)}>{fmtINR(dayPnl, { sign: true })}</span> · Charges {fmtINR(account?.total_charges)}
              </>
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card title="Equity curve" subtitle="Daily snapshot of cash + holdings value">
            <div className="px-2 pb-2">
              <EquityChart points={curve} baseline={start} />
            </div>
          </Card>
          <Card title="Allocation">
            <div className="p-4">
              <div className="flex h-3 overflow-hidden rounded-full bg-hover">
                {allocation.map((a) => (
                  <div key={a.label} style={{ width: `${a.pct}%`, background: a.color }} title={`${a.label} ${a.pct.toFixed(1)}%`} />
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {allocation.map((a) => (
                  <div key={a.label} className="flex items-center gap-2 text-[13px]">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />
                    <span className="flex-1 truncate">{a.label}</span>
                    <span className="num text-muted">{fmtINR(a.value, { decimals: false })}</span>
                    <span className="num w-12 text-right font-medium">{a.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <Card title={`Holdings (${rows.length})`} flush>
          <div className="overflow-x-auto">
            <HoldingsTable />
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Trading performance" subtitle="Based on closed (sell) trades">
            <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
              <Metric label="Closed trades" value={fmtQty(stats.closed)} />
              <Metric label="Win rate" value={stats.winRate != null ? `${stats.winRate.toFixed(1)}%` : "—"} />
              <Metric label="Profit factor" value={stats.profitFactor != null ? stats.profitFactor.toFixed(2) : "—"} />
              <Metric label="Avg win" value={<span className="text-up">{fmtINR(stats.avgWin)}</span>} />
              <Metric label="Avg loss" value={<span className="text-down">{fmtINR(stats.avgLoss)}</span>} />
              <Metric label="Buy executions" value={fmtQty(stats.buys)} />
              <Metric
                label="Best trade"
                value={stats.best ? <span className="text-up">{fmtINR(stats.best.realized_pnl, { sign: true })}</span> : "—"}
                sub={stats.best ? displaySymbol(stats.best.symbol) : undefined}
              />
              <Metric
                label="Worst trade"
                value={stats.worst ? <span className={changeClass(stats.worst.realized_pnl)}>{fmtINR(stats.worst.realized_pnl, { sign: true })}</span> : "—"}
                sub={stats.worst ? displaySymbol(stats.worst.symbol) : undefined}
              />
              <Metric label="Charges paid" value={fmtINR(account?.total_charges)} />
            </div>
          </Card>
          <Card title="Realised P&L by stock">
            {stats.bySymbol.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-muted">Sell a position to see realised profits here.</div>
            ) : (
              <div className="max-h-[300px] overflow-auto p-2">
                {stats.bySymbol.map(([sym, pnl]) => {
                  const maxAbs = Math.max(...stats.bySymbol.map(([, v]) => Math.abs(v))) || 1;
                  return (
                    <div key={sym} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-[13px] hover:bg-hover">
                      <span className="w-28 truncate font-medium">{displaySymbol(sym)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-hover">
                        <div className={cn("h-full rounded-full", pnl >= 0 ? "bg-up" : "bg-down")} style={{ width: `${(Math.abs(pnl) / maxAbs) * 100}%` }} />
                      </div>
                      <span className={cn("num w-28 text-right font-medium", changeClass(pnl))}>{fmtINR(pnl, { sign: true })}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, big }: { label: string; value: React.ReactNode; sub?: React.ReactNode; big?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className={cn("num mt-1.5 font-semibold tracking-tight", big ? "text-2xl" : "text-xl")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Card({ title, subtitle, children, flush }: { title: string; subtitle?: string; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className={cn("flex items-baseline justify-between gap-2 px-4 pt-3.5", flush ? "pb-3" : "pb-2")}>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <span className="text-[11px] text-faint">{subtitle}</span>}
      </div>
      {flush ? <div className="border-t border-line">{children}</div> : children}
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-panel p-3.5">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="num mt-1 text-[15px] font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
