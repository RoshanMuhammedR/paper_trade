// Server-side order engine.
//
// Fills are always decided from real market data:
//   * Market hours: MARKET orders and marketable LIMIT orders fill instantly at the live price.
//   * Everything else stays OPEN and is reconciled later by replaying the real
//     candles that printed after the order became active. This means pending
//     orders fill correctly even if the app was closed when the price was hit.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bar, Order, OrderType, Side, Validity } from "./types";
import { simulateOrder } from "./simulate";
import { computeCharges } from "./charges";
import { fetchChart, fetchMeta, fetchQuotes } from "./yahoo";
import { isTradable, sessionCloseFor, SYMBOL_RE } from "./market";
import { serverSecret } from "./supabase/server";
import type { YahooInterval } from "./timeframes";

const DAY_MS = 86_400_000;
const CIRCUIT_BAND = 0.2; // ±20% price band

export interface PlaceOrderInput {
  symbol: string;
  side: Side;
  orderType: OrderType;
  qty: number;
  limitPrice: number | null;
  triggerPrice: number | null;
  validity: Validity;
}

export class OrderError extends Error {}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseOrderInput(body: any): PlaceOrderInput {
  const symbol = String(body?.symbol ?? "").trim().toUpperCase();
  const side = body?.side;
  const orderType = body?.orderType;
  const qty = Number(body?.qty);
  const validity = body?.validity === "GTC" ? "GTC" : "DAY";
  const limitPrice = body?.limitPrice == null || body?.limitPrice === "" ? null : r2(Number(body.limitPrice));
  const triggerPrice = body?.triggerPrice == null || body?.triggerPrice === "" ? null : r2(Number(body.triggerPrice));

  if (!SYMBOL_RE.test(symbol) || !isTradable(symbol)) throw new OrderError("This instrument cannot be traded");
  if (side !== "BUY" && side !== "SELL") throw new OrderError("Invalid side");
  if (!["MARKET", "LIMIT", "SL", "SL-M"].includes(orderType)) throw new OrderError("Invalid order type");
  if (!Number.isInteger(qty) || qty <= 0 || qty > 1_000_000) throw new OrderError("Quantity must be a whole number between 1 and 10,00,000");
  if ((orderType === "LIMIT" || orderType === "SL") && !(limitPrice && limitPrice > 0)) throw new OrderError("Enter a valid limit price");
  if ((orderType === "SL" || orderType === "SL-M") && !(triggerPrice && triggerPrice > 0)) throw new OrderError("Enter a valid trigger price");
  if (orderType === "MARKET" && validity === "GTC") throw new OrderError("Market orders are valid for the day only");

  return {
    symbol,
    side,
    orderType,
    qty,
    limitPrice: orderType === "LIMIT" || orderType === "SL" ? limitPrice : null,
    triggerPrice: orderType === "SL" || orderType === "SL-M" ? triggerPrice : null,
    validity,
  };
}

export async function placeOrder(supabase: SupabaseClient, input: PlaceOrderInput): Promise<Order> {
  const meta = await fetchMeta(input.symbol);
  const ltp = meta.price;
  if (!ltp) throw new OrderError("No live price available for this symbol");

  const { side, orderType, limitPrice: L, triggerPrice: T } = input;
  const lo = ltp * (1 - CIRCUIT_BAND);
  const hi = ltp * (1 + CIRCUIT_BAND);
  for (const [label, p] of [["Limit", L], ["Trigger", T]] as const) {
    if (p != null && (p < lo || p > hi)) {
      throw new OrderError(`${label} price is outside the allowed band (₹${lo.toFixed(2)} – ₹${hi.toFixed(2)})`);
    }
  }
  if (T != null) {
    if (side === "BUY" && T <= ltp) throw new OrderError("Trigger price for a stop-loss BUY must be above the last traded price");
    if (side === "SELL" && T >= ltp) throw new OrderError("Trigger price for a stop-loss SELL must be below the last traded price");
  }
  if (orderType === "SL" && L != null && T != null) {
    if (side === "BUY" && L < T) throw new OrderError("Limit price must be at or above the trigger price for an SL BUY");
    if (side === "SELL" && L > T) throw new OrderError("Limit price must be at or below the trigger price for an SL SELL");
  }

  let fillPrice: number | null = null;
  if (meta.isOpen) {
    if (orderType === "MARKET") fillPrice = ltp;
    else if (orderType === "LIMIT" && L != null) {
      if (side === "BUY" && L >= ltp) fillPrice = ltp;
      if (side === "SELL" && L <= ltp) fillPrice = ltp;
    }
  }

  const now = Date.now();
  const expiresAt = input.validity === "DAY" ? sessionCloseFor(now) : now + 365 * DAY_MS;
  const charges = fillPrice != null ? computeCharges(side, fillPrice * input.qty).total : 0;

  const { data, error } = await supabase.rpc("pt_place_order", {
    p_secret: serverSecret(),
    p_symbol: input.symbol,
    p_side: side,
    p_order_type: orderType,
    p_qty: input.qty,
    p_limit_price: L,
    p_trigger_price: T,
    p_validity: input.validity,
    p_ref_price: ltp,
    p_is_amo: !meta.isOpen,
    p_expires_at: new Date(expiresAt).toISOString(),
    p_fill_price: fillPrice,
    p_fill_charges: charges,
  });
  if (error) throw new OrderError(error.message);
  return data as Order;
}

/** After a modification, fill immediately if the order became marketable during market hours */
export async function fillIfMarketable(supabase: SupabaseClient, order: Order): Promise<Order> {
  if (order.order_type !== "LIMIT" || order.limit_price == null) return order;
  const meta = await fetchMeta(order.symbol);
  if (!meta.isOpen) return order;
  const ltp = meta.price;
  const marketable = order.side === "BUY" ? order.limit_price >= ltp : order.limit_price <= ltp;
  if (!marketable) return order;
  const { data, error } = await supabase.rpc("pt_fill_order", {
    p_secret: serverSecret(),
    p_order_id: order.id,
    p_price: ltp,
    p_charges: computeCharges(order.side, ltp * order.qty).total,
    p_at: new Date().toISOString(),
  });
  if (error) throw new OrderError(error.message);
  return data as Order;
}

// ---------------------------------------------------------------------------
// Reconciliation of pending orders
// ---------------------------------------------------------------------------

export interface ReconcileEvent {
  orderId: string;
  symbol: string;
  side: Side;
  qty: number;
  status: Order["status"];
  price: number | null;
  message: string | null;
}

export async function reconcile(supabase: SupabaseClient): Promise<ReconcileEvent[]> {
  const { data: openOrders, error } = await supabase
    .from("pt_orders")
    .select("*")
    .in("status", ["OPEN", "TRIGGERED"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!openOrders?.length) return [];

  const now = Date.now();
  const bySymbol = new Map<string, Order[]>();
  for (const o of openOrders as Order[]) {
    const list = bySymbol.get(o.symbol) ?? [];
    list.push(o);
    bySymbol.set(o.symbol, list);
  }

  const events: ReconcileEvent[] = [];
  const secret = serverSecret();

  for (const [symbol, orders] of bySymbol) {
    const from = Math.min(...orders.map((o) => Date.parse(o.active_from)));
    const ageDays = (now - from) / DAY_MS;
    // Finest granularity Yahoo still serves for that far back
    const interval: YahooInterval = ageDays <= 6 ? "1m" : ageDays <= 55 ? "5m" : "1d";
    let bars: Bar[] = [];
    try {
      const res = await fetchChart({
        symbol,
        interval,
        period1: Math.floor(from / 1000) - 60,
        period2: Math.ceil(now / 1000),
      });
      bars = res.bars;
    } catch {
      continue; // market data hiccup — try again on the next sync
    }

    for (const order of orders) {
      const sim = simulateOrder(order, bars);
      let updated: Order | null = null;

      if (sim.fill) {
        const price = Math.round(sim.fill.price * 100) / 100;
        const { data, error: e } = await supabase.rpc("pt_fill_order", {
          p_secret: secret,
          p_order_id: order.id,
          p_price: price,
          p_charges: computeCharges(order.side, price * order.qty).total,
          p_at: new Date(sim.fill.at).toISOString(),
        });
        if (!e) updated = data as Order;
      } else if (order.expires_at && now >= Date.parse(order.expires_at)) {
        const { data, error: e } = await supabase.rpc("pt_set_order_status", {
          p_secret: secret,
          p_order_id: order.id,
          p_status: "EXPIRED",
          p_message: order.validity === "DAY" ? "Expired at end of session" : "Order validity ended",
        });
        if (!e) updated = data as Order;
      } else if (sim.triggered && order.status === "OPEN") {
        const { data, error: e } = await supabase.rpc("pt_set_order_status", {
          p_secret: secret,
          p_order_id: order.id,
          p_status: "TRIGGERED",
          p_message: "Trigger price hit; waiting for limit price",
        });
        if (!e) updated = data as Order;
      }

      if (updated && updated.status !== order.status) {
        events.push({
          orderId: updated.id,
          symbol: updated.symbol,
          side: updated.side,
          qty: updated.qty,
          status: updated.status,
          price: updated.filled_price,
          message: updated.status_message,
        });
      }
    }
  }
  return events;
}

/** Records today's equity (cash + market value of holdings) for the equity curve */
export async function snapshotEquity(supabase: SupabaseClient): Promise<{ equity: number } | null> {
  const [{ data: acc }, { data: holdings }] = await Promise.all([
    supabase.from("pt_accounts").select("cash").single(),
    supabase.from("pt_holdings").select("symbol, qty, avg_price"),
  ]);
  if (!acc) return null;
  let holdingsValue = 0;
  if (holdings?.length) {
    const quotes = await fetchQuotes(holdings.map((h) => h.symbol));
    const priceOf = new Map(quotes.map((q) => [q.symbol, q.price]));
    for (const h of holdings) holdingsValue += h.qty * (priceOf.get(h.symbol) || Number(h.avg_price));
  }
  const equity = Number(acc.cash) + holdingsValue;
  await supabase.rpc("pt_record_snapshot", {
    p_secret: serverSecret(),
    p_equity: Math.round(equity * 100) / 100,
    p_cash: Number(acc.cash),
    p_holdings_value: Math.round(holdingsValue * 100) / 100,
  });
  return { equity };
}
