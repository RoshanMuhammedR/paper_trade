"use client";

import { useCallback, useEffect, useState } from "react";
import { Focus, List, PanelBottom, PanelLeft, PanelRight, X } from "lucide-react";
import { ChartPanel } from "@/components/chart/ChartPanel";
import { Watchlist } from "@/components/Watchlist";
import { OrderPanel } from "@/components/OrderPanel";
import { BottomPanel } from "@/components/BottomPanel";
import { isTradable } from "@/lib/market";
import { openTicket, useApp } from "@/store/app";
import { IconButton, cn } from "@/components/ui/primitives";

interface Layout {
  watchlist: boolean;
  ticket: boolean;
  bottomCollapsed: boolean;
}

const LAYOUT_KEY = "pt-layout";
const DEFAULT_LAYOUT: Layout = { watchlist: true, ticket: true, bottomCollapsed: true };
const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

export default function TradePage() {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [watchDrawer, setWatchDrawer] = useState(false);
  const [ticketDrawer, setTicketDrawer] = useState(false);
  const ticket = useApp((s) => s.ticket);
  const symbol = useApp((s) => s.activeSymbol);
  const focus = useApp((s) => s.focusMode);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) setLayout({ ...DEFAULT_LAYOUT, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const update = useCallback((patch: Partial<Layout>) => {
    setLayout((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const setFocus = (v: boolean) => useApp.setState({ focusMode: v });

  // Anything that requests an order ticket (B/S buttons, chart "+", Exit) reveals it
  useEffect(() => {
    if (!ticket) return;
    if (isDesktop()) {
      setFocus(false);
      update({ ticket: true });
    } else setTicketDrawer(true);
  }, [ticket, update]);

  // Leaving the page always restores the top bar
  useEffect(() => () => setFocus(false), []);

  const toggleWatchlist = () => (isDesktop() ? update({ watchlist: !layout.watchlist }) : setWatchDrawer(true));
  const toggleTicket = () => (isDesktop() ? update({ ticket: !layout.ticket }) : setTicketDrawer(true));

  // Keyboard: Alt+W watchlist, Alt+T ticket, Alt+P positions panel, Alt+F focus mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "w") toggleWatchlist();
      else if (k === "t") toggleTicket();
      else if (k === "p") update({ bottomCollapsed: !layout.bottomCollapsed });
      else if (k === "f") setFocus(!useApp.getState().focusMode);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const showWatch = layout.watchlist && !focus;
  const showTicket = layout.ticket && !focus;
  const showBottom = !focus;

  return (
    <div className="flex h-full min-h-0">
      {showWatch && (
        <aside className="hidden w-[280px] shrink-0 border-r border-line lg:block">
          <Watchlist />
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <ChartPanel
            toolbarLeft={
              <>
                <IconButton title="Watchlist (Alt+W)" active={showWatch} onClick={toggleWatchlist}>
                  <PanelLeft size={16} />
                </IconButton>
                <div className="mx-0.5 h-5 w-px shrink-0 bg-line" />
              </>
            }
            toolbarRight={
              <>
                <div className="mx-0.5 h-5 w-px shrink-0 bg-line" />
                <IconButton
                  title="Positions & orders (Alt+P)"
                  active={showBottom && !layout.bottomCollapsed}
                  className="hidden md:inline-flex"
                  onClick={() => {
                    setFocus(false);
                    update({ bottomCollapsed: !layout.bottomCollapsed });
                  }}
                >
                  <PanelBottom size={16} />
                </IconButton>
                <IconButton title="Order ticket (Alt+T)" active={showTicket} onClick={toggleTicket}>
                  <PanelRight size={16} />
                </IconButton>
                <IconButton title={focus ? "Exit focus mode (Alt+F)" : "Focus mode: chart only (Alt+F)"} active={focus} onClick={() => setFocus(!focus)}>
                  <Focus size={16} />
                </IconButton>
              </>
            }
          />
        </div>
        {showBottom && (
          <div className="hidden md:block">
            <BottomPanel collapsed={layout.bottomCollapsed} onCollapsedChange={(v) => update({ bottomCollapsed: v })} />
          </div>
        )}
        {/* Mobile action bar */}
        {!focus && (
          <div className="flex shrink-0 gap-2 border-t border-line bg-panel p-2 lg:hidden">
            <button onClick={() => setWatchDrawer(true)} className="flex h-10 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] font-medium">
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
        )}
      </section>

      {showTicket && (
        <aside className="hidden w-[290px] shrink-0 border-l border-line lg:block">
          <OrderPanel />
        </aside>
      )}

      <Drawer side="left" open={watchDrawer} onClose={() => setWatchDrawer(false)}>
        <Watchlist onPick={() => setWatchDrawer(false)} />
      </Drawer>
      <Drawer side="right" open={ticketDrawer} onClose={() => setTicketDrawer(false)}>
        <OrderPanel onPlaced={() => setTicketDrawer(false)} />
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
