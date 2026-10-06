import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateOrder } from "../src/lib/simulate";
import { aggregateIntraday, normalizeBarTime, mergeDuplicateBars } from "../src/lib/timeframes";
import { istTime, sessionCloseFor, nextSessionOpen } from "../src/lib/market";
import { computeCharges } from "../src/lib/charges";
import type { Bar, Order } from "../src/lib/types";

const T0 = istTime(2026, 9, 6, 9 * 60 + 15); // Tue 6 Oct 2026 09:15 IST
const min = 60_000;

function bar(i: number, o: number, h: number, l: number, c: number): Bar {
  return { t: T0 + i * min, o, h, l, c, v: 100 };
}

function order(p: Partial<Order>): Order {
  return {
    id: "x",
    user_id: "u",
    symbol: "RELIANCE.NS",
    side: "BUY",
    order_type: "LIMIT",
    qty: 1,
    limit_price: null,
    trigger_price: null,
    ref_price: 100,
    validity: "DAY",
    status: "OPEN",
    is_amo: false,
    filled_price: null,
    filled_at: null,
    charges: 0,
    status_message: null,
    active_from: new Date(T0).toISOString(),
    expires_at: null,
    created_at: new Date(T0).toISOString(),
    updated_at: new Date(T0).toISOString(),
    ...p,
  };
}

const bars = [bar(0, 100, 101, 99, 100), bar(1, 100, 100.5, 97, 98), bar(2, 98, 104, 98, 103), bar(3, 95, 96, 94, 95)];

test("limit buy fills at limit when price trades through", () => {
  const r = simulateOrder(order({ side: "BUY", order_type: "LIMIT", limit_price: 98 }), bars);
  assert.deepEqual(r.fill, { price: 98, at: T0 + min });
});

test("limit buy fills at the open when the bar gaps below the limit", () => {
  const r = simulateOrder(order({ side: "BUY", order_type: "LIMIT", limit_price: 96, active_from: new Date(T0 + 3 * min).toISOString() }), bars);
  assert.equal(r.fill?.price, 95);
});

test("limit sell fills at limit", () => {
  const r = simulateOrder(order({ side: "SELL", order_type: "LIMIT", limit_price: 103.5 }), bars);
  assert.deepEqual(r.fill, { price: 103.5, at: T0 + 2 * min });
});

test("bars before the order became active are ignored", () => {
  // Placed mid-way through bar 2, so bar 2 (which touched 98) is not eligible
  const r = simulateOrder(order({ side: "BUY", order_type: "LIMIT", limit_price: 98, active_from: new Date(T0 + 2 * min + 30_000).toISOString() }), bars);
  assert.equal(r.fill?.price, 95);
});

test("SL-M sell triggers on the low and fills at trigger (or worse on a gap)", () => {
  assert.equal(simulateOrder(order({ side: "SELL", order_type: "SL-M", trigger_price: 97.5 }), bars).fill?.price, 97.5);
  const gap = simulateOrder(order({ side: "SELL", order_type: "SL-M", trigger_price: 96.5, active_from: new Date(T0 + 3 * min).toISOString() }), bars);
  assert.equal(gap.fill?.price, 95);
});

test("SL buy triggers but waits when the trigger fill is beyond the limit", () => {
  const r = simulateOrder(order({ side: "BUY", order_type: "SL", trigger_price: 102, limit_price: 101 }), bars.slice(0, 3));
  assert.equal(r.fill, undefined);
  assert.equal(r.triggered, true);
});

test("triggered SL buy then fills as a limit", () => {
  const r = simulateOrder(order({ side: "BUY", order_type: "SL", trigger_price: 102, limit_price: 101, status: "TRIGGERED" }), bars);
  assert.equal(r.fill?.price, 100); // first bar trades at or below the limit
});

test("AMO market order fills at the first bar's open", () => {
  const r = simulateOrder(order({ order_type: "MARKET", active_from: new Date(T0 - 12 * 3600_000).toISOString() }), bars);
  assert.deepEqual(r.fill, { price: 100, at: T0 });
});

test("orders do not fill on bars after expiry", () => {
  const r = simulateOrder(order({ side: "BUY", order_type: "LIMIT", limit_price: 98, expires_at: new Date(T0 + min).toISOString() }), bars);
  assert.equal(r.fill, undefined);
});

test("intraday aggregation buckets from 09:15", () => {
  const agg = aggregateIntraday(bars, 3);
  assert.equal(agg.length, 2);
  assert.deepEqual(agg[0], { t: T0, o: 100, h: 104, l: 97, c: 103, v: 300 });
  assert.equal(agg[1].t, T0 + 3 * min);
});

test("weekly bars normalise to Monday and merge Yahoo's trailing live row", () => {
  const monday = istTime(2026, 9, 5);
  const tue = istTime(2026, 9, 6, 15 * 60 + 15);
  assert.equal(normalizeBarTime(tue, "1wk"), monday);
  const merged = mergeDuplicateBars([
    { t: monday, o: 10, h: 12, l: 9, c: 11, v: 5 },
    { t: normalizeBarTime(tue, "1wk"), o: 11, h: 14, l: 10, c: 13, v: 7 },
  ]);
  assert.deepEqual(merged, [{ t: monday, o: 10, h: 14, l: 9, c: 13, v: 12 }]);
});

test("DAY order expiry and next open handle evenings and weekends", () => {
  const friEvening = istTime(2026, 9, 9, 18 * 60);
  assert.equal(sessionCloseFor(friEvening), istTime(2026, 9, 12, 15 * 60 + 30)); // Monday close
  assert.equal(nextSessionOpen(friEvening), istTime(2026, 9, 12, 9 * 60 + 15));
  const tueMorning = istTime(2026, 9, 6, 10 * 60);
  assert.equal(sessionCloseFor(tueMorning), istTime(2026, 9, 6, 15 * 60 + 30));
});

test("delivery charges", () => {
  const buy = computeCharges("BUY", 100_000);
  assert.equal(buy.stt, 100);
  assert.equal(buy.stamp, 15);
  assert.equal(buy.dp, 0);
  const sell = computeCharges("SELL", 100_000);
  assert.equal(sell.stamp, 0);
  assert.equal(sell.dp, 15.93);
  assert.ok(sell.total > buy.total - 15);
});
