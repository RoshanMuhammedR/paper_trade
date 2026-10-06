"use client";

import { create } from "zustand";
import type { Account, Holding, Order, OrderType, Quote, Side, SymbolMeta, Trade, Watchlist } from "@/lib/types";

export interface TicketPrefill {
  side: Side;
  symbol?: string;
  orderType?: OrderType;
  qty?: number;
  price?: number;
  trigger?: number;
  nonce: number;
}

export interface AppState {
  ready: boolean;
  email: string | null;
  account: Account | null;
  holdings: Holding[];
  orders: Order[];
  trades: Trade[];
  watchlists: Watchlist[];
  activeWatchlistId: string | null;
  quotes: Record<string, Quote>;
  activeSymbol: string;
  activeMeta: SymbolMeta | null;
  ticket: TicketPrefill | null;
  searchOpen: boolean;
  searchMode: "chart" | "watchlist";
  theme: "dark" | "light";
}

const readLocal = (key: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

export const useApp = create<AppState>(() => ({
  ready: false,
  email: null,
  account: null,
  holdings: [],
  orders: [],
  trades: [],
  watchlists: [],
  activeWatchlistId: null,
  quotes: {},
  activeSymbol: "RELIANCE.NS",
  activeMeta: null,
  ticket: null,
  searchOpen: false,
  searchMode: "chart",
  theme: "dark",
}));

export function initLocalState() {
  useApp.setState({
    activeSymbol: readLocal("pt-symbol", "RELIANCE.NS"),
    activeWatchlistId: readLocal("pt-watchlist", "") || null,
    theme: (document.documentElement.dataset.theme as "dark" | "light") ?? "dark",
  });
}

export function setActiveSymbol(symbol: string) {
  if (useApp.getState().activeSymbol === symbol) return;
  useApp.setState({ activeSymbol: symbol, activeMeta: null });
  try {
    localStorage.setItem("pt-symbol", symbol);
  } catch {}
}

export function setActiveWatchlist(id: string) {
  useApp.setState({ activeWatchlistId: id });
  try {
    localStorage.setItem("pt-watchlist", id);
  } catch {}
}

export function openTicket(p: Omit<TicketPrefill, "nonce">) {
  if (p.symbol) setActiveSymbol(p.symbol);
  useApp.setState({ ticket: { ...p, nonce: Date.now() } });
}

export function openSearch(mode: "chart" | "watchlist" = "chart") {
  useApp.setState({ searchOpen: true, searchMode: mode });
}

export function mergeQuotes(list: Quote[]) {
  if (!list.length) return;
  const quotes = { ...useApp.getState().quotes };
  for (const q of list) quotes[q.symbol] = q;
  useApp.setState({ quotes });
}

export function setTheme(theme: "dark" | "light") {
  document.documentElement.dataset.theme = theme;
  document.cookie = `pt-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  useApp.setState({ theme });
}

/** Live price for a symbol: chart meta (fastest) → watchlist quote */
export function livePrice(state: AppState, symbol: string): number | null {
  if (state.activeMeta?.symbol === symbol && state.activeMeta.price) return state.activeMeta.price;
  return state.quotes[symbol]?.price ?? null;
}
