export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
export type Validity = "DAY" | "GTC";
export type OrderStatus = "OPEN" | "TRIGGERED" | "EXECUTED" | "CANCELLED" | "REJECTED" | "EXPIRED";

export interface Account {
  user_id: string;
  cash: number;
  starting_cash: number;
  realized_pnl: number;
  total_charges: number;
  simulate_charges: boolean;
  created_at: string;
  reset_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  symbol: string;
  side: Side;
  order_type: OrderType;
  qty: number;
  limit_price: number | null;
  trigger_price: number | null;
  ref_price: number | null;
  validity: Validity;
  status: OrderStatus;
  is_amo: boolean;
  filled_price: number | null;
  filled_at: string | null;
  charges: number;
  status_message: string | null;
  active_from: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Holding {
  user_id: string;
  symbol: string;
  qty: number;
  avg_price: number;
  first_bought_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  order_id: string | null;
  user_id: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  charges: number;
  avg_cost: number | null;
  realized_pnl: number | null;
  executed_at: string;
}

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  symbols: string[];
  sort: number;
  created_at: string;
}

export interface EquitySnapshot {
  user_id: string;
  day: string;
  equity: number;
  cash: number;
  holdings_value: number;
}

/** Bar with millisecond timestamp */
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  spark: number[];
}

export interface SymbolMeta {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  prevClose: number;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketTime: number;
  sessionStart: number | null;
  sessionEnd: number | null;
  isOpen: boolean;
  firstTradeDate: number | null;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}
