import type { Side } from "./types";

// Approximate NSE equity-delivery charges (discount-broker style, zero brokerage).
export const CHARGE_RATES = {
  brokerage: 0,
  stt: 0.001, // 0.1% on buy and sell
  exchange: 0.0000297, // NSE transaction charge
  sebi: 0.000001, // ₹10 per crore
  stampBuy: 0.00015, // 0.015% on buy
  gst: 0.18, // on brokerage + exchange + SEBI
  dpPerSell: 15.93, // depository charge per scrip per sell (incl. GST)
};

export interface ChargeBreakdown {
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  stamp: number;
  gst: number;
  dp: number;
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeCharges(side: Side, turnover: number): ChargeBreakdown {
  const brokerage = CHARGE_RATES.brokerage;
  const stt = turnover * CHARGE_RATES.stt;
  const exchange = turnover * CHARGE_RATES.exchange;
  const sebi = turnover * CHARGE_RATES.sebi;
  const stamp = side === "BUY" ? turnover * CHARGE_RATES.stampBuy : 0;
  const gst = (brokerage + exchange + sebi) * CHARGE_RATES.gst;
  const dp = side === "SELL" && turnover > 0 ? CHARGE_RATES.dpPerSell : 0;
  const total = brokerage + stt + exchange + sebi + stamp + gst + dp;
  return {
    brokerage: r2(brokerage),
    stt: r2(stt),
    exchange: r2(exchange),
    sebi: r2(sebi),
    stamp: r2(stamp),
    gst: r2(gst),
    dp: r2(dp),
    total: r2(total),
  };
}
