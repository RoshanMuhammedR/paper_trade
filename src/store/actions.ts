"use client";

import type { Order, OrderType, Side, Validity } from "@/lib/types";
import { displaySymbol } from "@/lib/market";
import { fmtPrice } from "@/lib/format";
import { toast } from "@/components/ui/Toaster";
import { supabaseBrowser } from "@/lib/supabase/client";
import { loadTrading } from "./data";
import { useApp } from "./app";

export interface PlaceOrderRequest {
  symbol: string;
  side: Side;
  orderType: OrderType;
  qty: number;
  limitPrice?: number | null;
  triggerPrice?: number | null;
  validity: Validity;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export function describeOrder(o: Pick<Order, "side" | "qty" | "symbol">) {
  return `${o.side === "BUY" ? "Buy" : "Sell"} ${o.qty} ${displaySymbol(o.symbol)}`;
}

export async function placeOrder(req: PlaceOrderRequest): Promise<Order | null> {
  try {
    const order = await json<Order>(
      await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) }),
    );
    if (order.status === "EXECUTED") {
      toast.success(`${describeOrder(order)} executed`, `Filled at ₹${fmtPrice(order.filled_price)}`);
    } else if (order.status === "REJECTED") {
      toast.error(`${describeOrder(order)} rejected`, order.status_message ?? undefined);
    } else {
      toast.info(
        `${describeOrder(order)} placed`,
        order.is_amo ? "Market is closed — this after-market order will be processed in the next session." : "Order is open and will execute when the price condition is met.",
      );
    }
    await loadTrading();
    return order;
  } catch (err) {
    toast.error("Order failed", (err as Error).message);
    return null;
  }
}

export async function cancelOrder(id: string) {
  try {
    const order = await json<Order>(await fetch(`/api/orders/${id}`, { method: "DELETE" }));
    toast.info(`${describeOrder(order)} cancelled`);
  } catch (err) {
    toast.error("Could not cancel order", (err as Error).message);
  }
  await loadTrading();
}

export async function modifyOrder(id: string, patch: { qty: number; limitPrice?: number | null; triggerPrice?: number | null }) {
  try {
    const order = await json<Order>(
      await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }),
    );
    if (order.status === "EXECUTED") toast.success(`${describeOrder(order)} executed`, `Filled at ₹${fmtPrice(order.filled_price)}`);
    else toast.info(`${describeOrder(order)} modified`);
  } catch (err) {
    toast.error("Could not modify order", (err as Error).message);
  }
  await loadTrading();
}

let syncing = false;
export async function runSync(silent = false) {
  if (syncing) return;
  syncing = true;
  try {
    const res = await json<{ events: Array<{ symbol: string; side: Side; qty: number; status: Order["status"]; price: number | null; message: string | null }> }>(
      await fetch("/api/sync", { method: "POST" }),
    );
    for (const e of res.events) {
      const label = describeOrder(e);
      if (e.status === "EXECUTED") toast.success(`${label} executed`, `Filled at ₹${fmtPrice(e.price)}`);
      else if (e.status === "EXPIRED") toast.warn(`${label} expired`, e.message ?? undefined);
      else if (e.status === "REJECTED") toast.error(`${label} rejected`, e.message ?? undefined);
      else if (e.status === "TRIGGERED") toast.info(`${label} triggered`, e.message ?? undefined);
    }
    if (res.events.length) await loadTrading();
  } catch (err) {
    if (!silent) toast.error("Sync failed", (err as Error).message);
  } finally {
    syncing = false;
  }
}

export async function resetAccount(startingCash: number) {
  const { error } = await supabaseBrowser().rpc("pt_reset_account", { p_starting_cash: startingCash });
  if (error) {
    toast.error("Reset failed", error.message);
    return false;
  }
  toast.success("Account reset", `Starting capital ₹${fmtPrice(startingCash)}`);
  await loadTrading();
  return true;
}

export async function setSimulateCharges(enabled: boolean) {
  const { error } = await supabaseBrowser().rpc("pt_set_simulate_charges", { p_enabled: enabled });
  if (error) toast.error("Could not update setting", error.message);
  await loadTrading();
}

export function hasOpenOrders() {
  return useApp.getState().orders.some((o) => o.status === "OPEN" || o.status === "TRIGGERED");
}
