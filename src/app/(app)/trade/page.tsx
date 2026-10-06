"use client";

import { useEffect, useState } from "react";
import { List, X } from "lucide-react";
import { ChartPanel } from "@/components/chart/ChartPanel";
import { Watchlist } from "@/components/Watchlist";
import { OrderPanel } from "@/components/OrderPanel";
import { BottomPanel } from "@/components/BottomPanel";
import { isTradable } from "@/lib/market";
import { openTicket, useApp } from "@/store/app";
import { cn } from "@/components/ui/primitives";

export default function TradePage() {
  const [watchOpen, setWatchOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const ticket = useApp((s) => s.ticket);
  const symbol = useApp((s) => s.activeSymbol);

  // On small screens the order ticket is a drawer; open it when something requests a ticket
  useEffect(() => {
    if (ticket && window.matchMedia("(max-width: 1023px)").matches) setTicketOpen(true);
  }, [ticket]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-[300px] shrink-0 border-r border-line xl:block">
        <Watchlist />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <ChartPanel />
        </div>
        <div className="hidden md:block">
          <BottomPanel />
        </div>
        {/* Mobile action bar */}
        <div className="flex shrink-0 gap-2 border-t border-line bg-panel p-2 lg:hidden">
          <button
            onClick={() => setWatchOpen(true)}
            className="flex h-10 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] font-medium xl:hidden"
          >
            <List size={16} /> Watchlist
          </button>
          {isTradable(symbol) && (
            <>
              <button onClick={() => openTicket({ side: "BUY" })} className="h-10 flex-1 rounded-md bg-up text-[13px] font-semibold text-white">
                Buy
              </button>
              <button onClick={() => openTicket({ side: "SELL" })} className="h-10 flex-1 rounded-md bg-down text-[13px] font-semibold text-white">
                Sell
              </button>
            </>
          )}
        </div>
      </section>

      <aside className="hidden w-[300px] shrink-0 border-l border-line lg:block">
        <OrderPanel />
      </aside>

      {/* Watchlist button for lg screens without the sidebar */}
      <button
        onClick={() => setWatchOpen(true)}
        className="fixed bottom-[276px] left-0 z-30 hidden h-24 w-5 items-center justify-center rounded-r-md border border-l-0 border-line bg-panel text-faint shadow-sm hover:text-fg lg:flex xl:hidden"
        title="Show watchlist"
        aria-label="Show watchlist"
      >
        <List size={13} />
      </button>

      <Drawer side="left" open={watchOpen} onClose={() => setWatchOpen(false)}>
        <Watchlist onPick={() => setWatchOpen(false)} />
      </Drawer>
      <Drawer side="right" open={ticketOpen} onClose={() => setTicketOpen(false)}>
        <OrderPanel onPlaced={() => setTicketOpen(false)} />
      </Drawer>
    </div>
  );
}

function Drawer({ side, open, onClose, children }: { side: "left" | "right"; open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("fixed inset-0 z-[80]", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
      <div className={cn("absolute inset-0 bg-black/50 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <div
        className={cn(
          "absolute top-0 h-full w-[min(340px,92vw)] border-line bg-panel shadow-pop transition-transform duration-200",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          open ? "translate-x-0" : side === "left" ? "-translate-x-full" : "translate-x-full",
        )}
      >
        <button
          onClick={onClose}
          className={cn(
            "absolute top-2 z-10 rounded-full border border-line bg-panel p-1.5 text-muted shadow-pop hover:text-fg",
            side === "left" ? "left-full ml-2" : "right-full mr-2",
          )}
          aria-label="Close"
        >
          <X size={16} />
        </button>
        {open && children}
      </div>
    </div>
  );
}
