"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ChartCandlestick, Ellipsis, GripVertical, Pencil, Plus, Search, Trash, X } from "lucide-react";
import type { Quote } from "@/lib/types";
import { displaySymbol, exchangeOf, isTradable } from "@/lib/market";
import { changeClass, fmtPct, fmtPrice, fmtSigned } from "@/lib/format";
import { openSearch, openTicket, setActiveSymbol, setActiveWatchlist, useApp } from "@/store/app";
import { createWatchlist, deleteWatchlist, removeFromWatchlist, renameWatchlist, reorderWatchlist } from "@/store/data";
import { Sparkline } from "./Sparkline";
import { Empty, IconButton, MenuItem, Popover, cn } from "./ui/primitives";

type SortKey = "custom" | "name" | "change" | "price";

export function Watchlist({ onPick }: { onPick?: () => void }) {
  const watchlists = useApp((s) => s.watchlists);
  const activeId = useApp((s) => s.activeWatchlistId);
  const quotes = useApp((s) => s.quotes);
  const activeSymbol = useApp((s) => s.activeSymbol);
  const holdings = useApp((s) => s.holdings);
  const [sort, setSort] = useState<SortKey>("custom");
  const [dragging, setDragging] = useState<string | null>(null);

  const list = watchlists.find((w) => w.id === activeId) ?? watchlists[0];
  const held = useMemo(() => new Set(holdings.map((h) => h.symbol)), [holdings]);

  const symbols = useMemo(() => {
    if (!list) return [];
    const arr = [...list.symbols];
    if (sort === "name") arr.sort((a, b) => displaySymbol(a).localeCompare(displaySymbol(b)));
    if (sort === "change") arr.sort((a, b) => (quotes[b]?.changePct ?? -999) - (quotes[a]?.changePct ?? -999));
    if (sort === "price") arr.sort((a, b) => (quotes[b]?.price ?? 0) - (quotes[a]?.price ?? 0));
    return arr;
  }, [list, sort, quotes]);

  function onDrop(target: string) {
    if (!list || !dragging || dragging === target) return;
    const arr = list.symbols.filter((s) => s !== dragging);
    arr.splice(arr.indexOf(target), 0, dragging);
    reorderWatchlist(list.id, arr);
    setDragging(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      {/* List tabs */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {watchlists.map((w) => (
            <button
              key={w.id}
              onClick={() => setActiveWatchlist(w.id)}
              className={cn(
                "h-7 shrink-0 rounded-md px-2.5 text-xs font-medium transition-colors",
                w.id === list?.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover hover:text-fg",
              )}
            >
              {w.name}
            </button>
          ))}
        </div>
        <Popover
          align="right"
          trigger={({ toggle }) => (
            <IconButton title="Watchlist options" onClick={toggle} className="h-7 min-w-7">
              <Ellipsis size={16} />
            </IconButton>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Plus size={14} />}
                onClick={() => {
                  close();
                  const name = window.prompt("New watchlist name", `Watchlist ${watchlists.length + 1}`);
                  if (name?.trim()) void createWatchlist(name.trim());
                }}
              >
                New watchlist
              </MenuItem>
              {list && (
                <MenuItem
                  icon={<Pencil size={14} />}
                  onClick={() => {
                    close();
                    const name = window.prompt("Rename watchlist", list.name);
                    if (name?.trim()) renameWatchlist(list.id, name.trim());
                  }}
                >
                  Rename “{list.name}”
                </MenuItem>
              )}
              {list && watchlists.length > 1 && (
                <MenuItem
                  icon={<Trash size={14} />}
                  danger
                  onClick={() => {
                    close();
                    if (window.confirm(`Delete watchlist “${list.name}”?`)) void deleteWatchlist(list.id);
                  }}
                >
                  Delete watchlist
                </MenuItem>
              )}
            </>
          )}
        </Popover>
      </div>

      {/* Search + sort */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line p-2">
        <button
          onClick={() => openSearch("watchlist")}
          className="flex h-8 flex-1 items-center gap-2 rounded-md border border-line bg-panel-2 px-2.5 text-[13px] text-faint hover:border-line-strong"
        >
          <Search size={14} /> Search &amp; add
        </button>
        <Popover
          align="right"
          trigger={({ toggle }) => (
            <IconButton title="Sort" onClick={toggle} active={sort !== "custom"}>
              <ArrowUpDown size={15} />
            </IconButton>
          )}
        >
          {(close) =>
            (
              [
                ["custom", "Custom order"],
                ["name", "Name"],
                ["change", "% Change"],
                ["price", "Last price"],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <MenuItem
                key={k}
                active={sort === k}
                onClick={() => {
                  setSort(k);
                  close();
                }}
              >
                {label}
              </MenuItem>
            ))
          }
        </Popover>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list && symbols.length === 0 && (
          <Empty icon={<Search size={22} />} title="This watchlist is empty">
            Search for stocks and indices to add them here.
          </Empty>
        )}
        {symbols.map((sym) => (
          <WatchRow
            key={sym}
            symbol={sym}
            quote={quotes[sym]}
            active={sym === activeSymbol}
            held={held.has(sym)}
            draggable={sort === "custom"}
            onDragStart={() => setDragging(sym)}
            onDrop={() => onDrop(sym)}
            onPick={() => {
              setActiveSymbol(sym);
              onPick?.();
            }}
            onRemove={() => list && removeFromWatchlist(list.id, sym)}
          />
        ))}
      </div>
      {list && (
        <div className="shrink-0 border-t border-line px-3 py-1.5 text-[11px] text-faint">
          {list.symbols.length} / 100 symbols{sort === "custom" && list.symbols.length > 1 ? " · drag to reorder" : ""}
        </div>
      )}
    </div>
  );
}

const WatchRow = memo(function WatchRow({
  symbol,
  quote,
  active,
  held,
  draggable,
  onDragStart,
  onDrop,
  onPick,
  onRemove,
}: {
  symbol: string;
  quote?: Quote;
  active: boolean;
  held: boolean;
  draggable: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onPick: () => void;
  onRemove: () => void;
}) {
  const prev = useRef<number | undefined>(undefined);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const p = quote?.price;
    if (p != null && prev.current != null && p !== prev.current) {
      setFlash(p > prev.current ? "up" : "down");
      const id = setTimeout(() => setFlash(null), 900);
      prev.current = p;
      return () => clearTimeout(id);
    }
    prev.current = p;
  }, [quote?.price]);

  const tradable = isTradable(symbol);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => draggable && e.preventDefault()}
      onDrop={onDrop}
      onClick={onPick}
      className={cn(
        "group relative flex h-[52px] cursor-pointer items-center gap-2 border-b border-line/60 px-3 transition-colors hover:bg-hover",
        active && "bg-accent-soft/60 hover:bg-accent-soft",
        flash === "up" && "flash-up",
        flash === "down" && "flash-down",
      )}
    >
      {draggable && <GripVertical size={12} className="absolute left-0.5 hidden text-faint group-hover:block" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-[13px] font-semibold", quote && changeClass(quote.change))}>{displaySymbol(symbol)}</span>
          {held && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="In holdings" />}
        </div>
        <div className="text-[10px] font-medium text-faint">{exchangeOf(symbol)}</div>
      </div>
      <div className="shrink-0 group-hover:invisible">
        <Sparkline values={quote?.spark ?? []} base={quote?.prevClose} />
      </div>
      <div className="w-[84px] shrink-0 text-right group-hover:invisible">
        <div className="num text-[13px] font-medium">{quote ? fmtPrice(quote.price) : "—"}</div>
        <div className={cn("num text-[11px]", changeClass(quote?.change))}>
          {quote ? `${fmtSigned(quote.change)} ${fmtPct(quote.changePct)}` : ""}
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute right-2 hidden items-center gap-1 group-hover:flex">
        {tradable && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openTicket({ side: "BUY", symbol });
              }}
              className="h-7 rounded-md bg-up px-2.5 text-xs font-semibold text-white hover:brightness-110"
            >
              B
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openTicket({ side: "SELL", symbol });
              }}
              className="h-7 rounded-md bg-down px-2.5 text-xs font-semibold text-white hover:brightness-110"
            >
              S
            </button>
          </>
        )}
        <button
          title="Open chart"
          onClick={(e) => {
            e.stopPropagation();
            onPick();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-panel text-muted hover:text-fg"
        >
          <ChartCandlestick size={14} />
        </button>
        <button
          title="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-panel text-muted hover:text-down"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
});
