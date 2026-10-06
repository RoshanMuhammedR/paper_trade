# PaperTrade — NSE paper trading terminal

Practice trading Indian stocks (NSE/BSE) with **live prices**, a **broker-grade chart** and a
**persistent virtual portfolio**. Free to run: Next.js + Supabase free tier + Yahoo Finance data.

## Features

**Charting** (KLineChart)
- 14 timeframes: 1m, 2m, 3m, 5m, 10m, 15m, 30m, 1h, 2h, 4h, 1D, 1W, 1M, 3M
- Infinite history: scroll left to load older data
- Candles, hollow candles, OHLC bars, line and area; linear / log / percentage scale
- 35+ indicators: EMA, MA, WMA, Bollinger, VWAP, SuperTrend, Ichimoku, Donchian, Keltner, SAR,
  RSI, MACD, Stochastic, KDJ, ATR, DMI/ADX, CCI, Williams %R, OBV, volume, and more.
  Each one can be toggled, configured and removed straight from the chart legend.
- Drawing tools: trend line, ray, extended line, horizontal/vertical lines, price line, arrow,
  parallel and price channels, Fibonacci retracement, rectangle, circle, triangle, text,
  annotation, price tag, brush and a measure tool. Includes a magnet mode, lock and hide.
  **Drawings are saved per symbol** to your account.
- Your trading on the chart: open orders as draggable lines (drag to modify, ✕ to cancel),
  your average-price line with live P&L, and buy/sell execution markers
- Crosshair **+** button to start a limit order at any price; screenshot export; fullscreen

**Trading**
- Market, Limit, SL and SL-M orders; Day and GTC validity; quantity or amount (₹) entry
- After-market orders (AMO) when the market is closed
- Pending orders are **filled against real 1-minute candles** (5-minute / daily for older orders),
  so a limit order that was hit while the app was closed still fills at the correct price
- Realistic NSE delivery charges (STT, exchange, SEBI, stamp duty, GST, DP); can be turned off
- Funds and quantity are blocked for pending orders, as at a real broker

**Portfolio**
- Holdings with live LTP, P&L, day change and allocation
- Equity curve, realised P&L, win rate, profit factor, best/worst trades
- Order history, trade journal and CSV export
- Multiple watchlists with live quotes, sparklines and drag to reorder
- Dark and light themes, keyboard shortcuts (`Ctrl K` search, `B`/`S` side, `Esc`, `Delete`)

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

### 1. Supabase

1. Run [`supabase/migrations/0001_paper_trading.sql`](supabase/migrations/0001_paper_trading.sql)
   in the Supabase SQL editor. All tables are prefixed `pt_`, so it can share a project with other apps.
2. Generate a long random secret, put it in `.env.local` as `PT_SERVER_SECRET`, and store its hash:

   ```sql
   insert into pt_private.config (key, value)
   values ('server_secret_sha256', encode(extensions.digest('<your secret>', 'sha256'), 'hex'))
   on conflict (key) do update set value = excluded.value;
   ```

   Trades can only be executed through functions that check this secret. Only the Next.js server,
   which fetches the real market price, can fill orders. Users can read their own data but can
   never write balances, orders or holdings directly.
3. Under **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback` (and your
   deployed URL's `/auth/callback`) to the redirect URLs so email confirmation links come back to the app.

### 2. Environment variables

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key |
| `PT_SERVER_SECRET` | Server-only secret whose sha256 is in `pt_private.config` |

### Deploying (free)

Deploy to Vercel (Hobby) and set the three environment variables. No cron job is needed: pending
orders are reconciled against historical candles whenever you open the app.

## How it works

```
Browser ──► /api/market/*  ──► Yahoo Finance (cached, deduped)
        ──► /api/orders    ──► live price ──► pt_place_order()  (Postgres, SECURITY DEFINER)
        ──► /api/sync      ──► 1m candles since each pending order ──► pt_fill_order()
        ──► Supabase (RLS) for reading account, orders, holdings, watchlists, drawings
```

- `src/lib/engine.ts`: order validation, instant fills, reconciliation of pending orders
- `src/lib/simulate.ts`: fill simulation for limit / stop orders against candles (unit tested)
- `src/lib/yahoo.ts`: market data client with in-process caching
- `src/components/chart/`: chart, custom indicators, drawing tools and trading overlays

```bash
npm test         # engine / timeframe / charges tests
npm run build
```

## Notes and limitations

- Prices come from Yahoo Finance's public endpoints (no API key). NSE quotes are near real-time
  but are not an official exchange feed, and the endpoints can change without notice.
- Equity delivery (CNC) only: no intraday leverage, short selling or F&O.
- Exchange holidays are detected from market data, so a DAY order placed the evening before a
  holiday expires at that day's close.
- For education only. Not investment advice.
