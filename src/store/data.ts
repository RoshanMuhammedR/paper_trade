"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { Account, Holding, Order, Trade, Watchlist } from "@/lib/types";
import { useApp, setActiveWatchlist } from "./app";
import { toast } from "@/components/ui/Toaster";
import { displaySymbol } from "@/lib/market";

const sb = () => supabaseBrowser();

export async function bootstrap() {
  const { data: { user } } = await sb().auth.getUser();
  useApp.setState({ email: user?.email ?? null });
  const { error } = await sb().rpc("pt_ensure_account");
  if (error) toast.error("Could not initialise your account", error.message);
  await Promise.all([loadTrading(), loadWatchlists()]);
  useApp.setState({ ready: true });
}

export async function loadTrading() {
  const [acc, hold, ord, tr] = await Promise.all([
    sb().from("pt_accounts").select("*").maybeSingle(),
    sb().from("pt_holdings").select("*").order("symbol"),
    sb().from("pt_orders").select("*").order("created_at", { ascending: false }).limit(500),
    sb().from("pt_trades").select("*").order("executed_at", { ascending: false }).limit(1000),
  ]);
  useApp.setState({
    account: (acc.data as Account) ?? null,
    holdings: (hold.data as Holding[]) ?? [],
    orders: (ord.data as Order[]) ?? [],
    trades: (tr.data as Trade[]) ?? [],
  });
}

export async function loadWatchlists() {
  const { data } = await sb().from("pt_watchlists").select("*").order("sort").order("created_at");
  const lists = (data as Watchlist[]) ?? [];
  const { activeWatchlistId } = useApp.getState();
  useApp.setState({ watchlists: lists });
  if (lists.length && !lists.some((l) => l.id === activeWatchlistId)) setActiveWatchlist(lists[0].id);
}

async function saveWatchlist(id: string, patch: Partial<Watchlist>) {
  const prev = useApp.getState().watchlists;
  useApp.setState({ watchlists: prev.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  const { error } = await sb().from("pt_watchlists").update(patch).eq("id", id);
  if (error) {
    useApp.setState({ watchlists: prev });
    toast.error("Could not update watchlist", error.message);
  }
}

export function addToWatchlist(id: string, symbol: string) {
  const wl = useApp.getState().watchlists.find((w) => w.id === id);
  if (!wl) return;
  if (wl.symbols.includes(symbol)) {
    toast.info(`Already in ${wl.name}`);
    return;
  }
  if (wl.symbols.length >= 100) {
    toast.warn("Watchlist is full", "A watchlist can hold up to 100 symbols.");
    return;
  }
  void saveWatchlist(id, { symbols: [...wl.symbols, symbol] });
  toast.success(`Added ${displaySymbol(symbol)} to ${wl.name}`);
}

export function removeFromWatchlist(id: string, symbol: string) {
  const wl = useApp.getState().watchlists.find((w) => w.id === id);
  if (wl) void saveWatchlist(id, { symbols: wl.symbols.filter((s) => s !== symbol) });
}

export function reorderWatchlist(id: string, symbols: string[]) {
  void saveWatchlist(id, { symbols });
}

export function renameWatchlist(id: string, name: string) {
  void saveWatchlist(id, { name: name.slice(0, 40) });
}

export async function createWatchlist(name: string) {
  const sort = useApp.getState().watchlists.length;
  const { data, error } = await sb().from("pt_watchlists").insert({ name: name.slice(0, 40), sort, symbols: [] }).select().single();
  if (error) return toast.error("Could not create watchlist", error.message);
  useApp.setState({ watchlists: [...useApp.getState().watchlists, data as Watchlist] });
  setActiveWatchlist((data as Watchlist).id);
}

export async function deleteWatchlist(id: string) {
  const { error } = await sb().from("pt_watchlists").delete().eq("id", id);
  if (error) return toast.error("Could not delete watchlist", error.message);
  const rest = useApp.getState().watchlists.filter((w) => w.id !== id);
  useApp.setState({ watchlists: rest });
  if (rest[0]) setActiveWatchlist(rest[0].id);
}

// ---------------------------------------------------------------------------
// Chart drawings + preferences
// ---------------------------------------------------------------------------

export async function loadDrawings(symbol: string): Promise<unknown[]> {
  const { data } = await sb().from("pt_chart_drawings").select("overlays").eq("symbol", symbol).maybeSingle();
  return (data?.overlays as unknown[]) ?? [];
}

export async function saveDrawings(symbol: string, overlays: unknown[]) {
  const { data: { user } } = await sb().auth.getUser();
  if (!user) return;
  await sb()
    .from("pt_chart_drawings")
    .upsert({ user_id: user.id, symbol, overlays, updated_at: new Date().toISOString() });
}

export async function loadPrefs<T>(): Promise<Partial<T>> {
  const { data } = await sb().from("pt_user_prefs").select("prefs").maybeSingle();
  return (data?.prefs as Partial<T>) ?? {};
}

export async function savePrefs(prefs: Record<string, unknown>) {
  const { data: { user } } = await sb().auth.getUser();
  if (!user) return;
  await sb().from("pt_user_prefs").upsert({ user_id: user.id, prefs, updated_at: new Date().toISOString() });
}
