"use client";

import { useEffect, useMemo } from "react";
import type { Quote } from "@/lib/types";
import { TICKER_INDICES, isWithinSessionHours } from "@/lib/market";
import { mergeQuotes, useApp } from "./app";
import { hasOpenOrders, runSync } from "./actions";

/** Polls quotes for everything visible: indices, watchlist, holdings, open orders */
export function useQuotePolling() {
  const watchlists = useApp((s) => s.watchlists);
  const activeId = useApp((s) => s.activeWatchlistId);
  const holdings = useApp((s) => s.holdings);
  const orders = useApp((s) => s.orders);
  const activeSymbol = useApp((s) => s.activeSymbol);

  const key = useMemo(() => {
    const set = new Set<string>(TICKER_INDICES);
    watchlists.find((w) => w.id === activeId)?.symbols.forEach((s) => set.add(s));
    holdings.forEach((h) => set.add(h.symbol));
    orders.filter((o) => o.status === "OPEN" || o.status === "TRIGGERED").forEach((o) => set.add(o.symbol));
    set.add(activeSymbol);
    return Array.from(set).sort().join(",");
  }, [watchlists, activeId, holdings, orders, activeSymbol]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      if (!document.hidden && key) {
        try {
          const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(key)}`);
          if (res.ok) mergeQuotes((await res.json()) as Quote[]);
        } catch {}
      }
      if (!cancelled) timer = setTimeout(tick, isWithinSessionHours(Date.now()) ? 3000 : 30_000);
    };
    tick();
    const onVis = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [key]);
}

/** Periodically reconciles pending orders against real prices */
export function useOrderSync() {
  const ready = useApp((s) => s.ready);
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      if (!document.hidden) await runSync(true);
      if (cancelled) return;
      const open = hasOpenOrders();
      const live = isWithinSessionHours(Date.now());
      timer = setTimeout(tick, open ? (live ? 8000 : 60_000) : 180_000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready]);
}
