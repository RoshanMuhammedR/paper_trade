import type { Bar, Order } from "./types";

export type SimResult = { fill?: { price: number; at: number }; triggered: boolean };

export function simulateOrder(order: Order, bars: Bar[]): SimResult {
  const activeFrom = Date.parse(order.active_from);
  const expires = order.expires_at ? Date.parse(order.expires_at) : Infinity;
  const L = order.limit_price;
  const T = order.trigger_price;
  let triggered = order.status === "TRIGGERED";
  const buy = order.side === "BUY";

  for (const b of bars) {
    if (b.t < activeFrom) continue;
    if (b.t >= expires) break;
    const at = Math.max(b.t, activeFrom);
    switch (order.order_type) {
      case "MARKET":
        return { fill: { price: b.o, at }, triggered };
      case "LIMIT":
        if (L == null) break;
        if (buy && b.l <= L) return { fill: { price: Math.min(b.o, L), at }, triggered };
        if (!buy && b.h >= L) return { fill: { price: Math.max(b.o, L), at }, triggered };
        break;
      case "SL-M":
        if (T == null) break;
        if (buy && b.h >= T) return { fill: { price: Math.max(b.o, T), at }, triggered: true };
        if (!buy && b.l <= T) return { fill: { price: Math.min(b.o, T), at }, triggered: true };
        break;
      case "SL":
        if (T == null || L == null) break;
        if (!triggered) {
          if (buy && b.h >= T) {
            triggered = true;
            const p = Math.max(b.o, T);
            if (p <= L) return { fill: { price: p, at }, triggered };
          } else if (!buy && b.l <= T) {
            triggered = true;
            const p = Math.min(b.o, T);
            if (p >= L) return { fill: { price: p, at }, triggered };
          }
        } else {
          if (buy && b.l <= L) return { fill: { price: Math.min(b.o, L), at }, triggered };
          if (!buy && b.h >= L) return { fill: { price: Math.max(b.o, L), at }, triggered };
        }
        break;
    }
  }
  return { triggered };
}
