"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CornerDownLeft, Plus, Search, X } from "lucide-react";
import type { SearchResult } from "@/lib/types";
import { displaySymbol, exchangeOf, toYahooSymbol } from "@/lib/market";
import { setActiveSymbol, useApp } from "@/store/app";
import { addToWatchlist } from "@/store/data";
import { Badge, Spinner, cn } from "./ui/primitives";

const POPULAR: SearchResult[] = [
  { symbol: "^NSEI", name: "NIFTY 50 Index", exchange: "INDEX", type: "INDEX" },
  { symbol: "^NSEBANK", name: "NIFTY BANK Index", exchange: "INDEX", type: "INDEX" },
  { symbol: "RELIANCE.NS", name: "Reliance Industries Ltd", exchange: "NSE", type: "EQUITY" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank Ltd", exchange: "NSE", type: "EQUITY" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services Ltd", exchange: "NSE", type: "EQUITY" },
  { symbol: "INFY.NS", name: "Infosys Ltd", exchange: "NSE", type: "EQUITY" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank Ltd", exchange: "NSE", type: "EQUITY" },
  { symbol: "SBIN.NS", name: "State Bank of India", exchange: "NSE", type: "EQUITY" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel Ltd", exchange: "NSE", type: "EQUITY" },
  { symbol: "ITC.NS", name: "ITC Ltd", exchange: "NSE", type: "EQUITY" },
  { symbol: "LT.NS", name: "Larsen & Toubro Ltd", exchange: "NSE", type: "EQUITY" },
  { symbol: "TATASTEEL.NS", name: "Tata Steel Ltd", exchange: "NSE", type: "EQUITY" },
];

export function SymbolSearch() {
  const open = useApp((s) => s.searchOpen);
  const mode = useApp((s) => s.searchMode);
  const activeWatchlistId = useApp((s) => s.activeWatchlistId);
  const watchlistName = useApp((s) => s.watchlists.find((w) => w.id === s.activeWatchlistId)?.name);
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>(POPULAR);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = () => useApp.setState({ searchOpen: false });

  useEffect(() => {
    if (open) {
      setQ("");
      setResults(POPULAR);
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) {
      setResults(POPULAR);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = (await res.json()) as SearchResult[];
        let list = Array.isArray(data) ? data : [];
        // Allow opening a raw ticker even if search misses it
        const raw = toYahooSymbol(term);
        if (/^[A-Z0-9&^.-]{2,20}$/i.test(term) && !list.some((r) => r.symbol === raw)) {
          list = [...list, { symbol: raw, name: `Open ${raw}`, exchange: exchangeOf(raw), type: "EQUITY" }];
        }
        setResults(list);
        setCursor(0);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, open]);

  function choose(r: SearchResult, addOnly = false) {
    if (mode === "watchlist" || addOnly) {
      if (activeWatchlistId) addToWatchlist(activeWatchlistId, r.symbol);
      if (mode === "watchlist") return; // keep open for adding more
      return;
    }
    setActiveSymbol(r.symbol);
    close();
    if (!pathname.startsWith("/trade")) router.push("/trade");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      choose(results[cursor]);
    } else if (e.key === "Escape") {
      close();
    }
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 pt-[10vh] backdrop-blur-[2px]" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="Symbol search"
        className="toast-in w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={mode === "watchlist" ? `Add to ${watchlistName ?? "watchlist"}…` : "Search NSE / BSE stocks and indices…"}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          {loading && <Spinner className="h-3.5 w-3.5 text-faint" />}
          <button onClick={close} className="text-faint hover:text-fg" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div ref={listRef} className="max-h-[56vh] overflow-auto p-1.5">
          {!q.trim() && <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Popular</div>}
          {results.length === 0 && !loading && <div className="px-3 py-8 text-center text-[13px] text-muted">No matches</div>}
          {results.map((r, i) => (
            <div
              key={r.symbol}
              data-idx={i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(r)}
              className={cn(
                "group flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2",
                i === cursor && "bg-hover",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{displaySymbol(r.symbol)}</div>
                <div className="truncate text-xs text-muted">{r.name}</div>
              </div>
              <Badge tone={r.exchange === "INDEX" ? "accent" : "neutral"}>{r.exchange}</Badge>
              {mode === "chart" && (
                <button
                  title="Add to watchlist"
                  onClick={(e) => {
                    e.stopPropagation();
                    choose(r, true);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-faint opacity-0 transition hover:bg-panel hover:text-accent group-hover:opacity-100"
                >
                  <Plus size={15} />
                </button>
              )}
              {mode === "watchlist" && <Plus size={15} className="text-faint" />}
              {mode === "chart" && i === cursor && <CornerDownLeft size={13} className="text-faint" />}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-faint">
          <span>↑↓ navigate</span>
          <span>↵ {mode === "watchlist" ? "add" : "open chart"}</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
