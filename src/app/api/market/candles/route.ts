import { NextResponse, type NextRequest } from "next/server";
import { fetchChart, fetchMeta, UpstreamError } from "@/lib/yahoo";
import { aggregateIntraday, getTimeframe } from "@/lib/timeframes";
import { istDayStart, SYMBOL_RE } from "@/lib/market";

const DAY_MS = 86_400_000;

// GET /api/market/candles?symbol=RELIANCE.NS&tf=15m[&to=<ms>][&live=1]
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = (sp.get("symbol") ?? "").toUpperCase();
  const tf = getTimeframe(sp.get("tf") ?? "1D");
  const live = sp.get("live") === "1";
  const toParam = sp.get("to");

  if (!SYMBOL_RE.test(symbol)) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });

  try {
    if (live) {
      const [{ bars }, meta] = await Promise.all([
        fetchChart({ symbol, interval: tf.yahoo, range: tf.liveRange }),
        fetchMeta(symbol), // range=1d meta has the correct previous close
      ]);
      const out = tf.agg > 1 && tf.minutes ? aggregateIntraday(bars, tf.minutes) : bars;
      // `since` = last bar the client has; return everything from there to fill gaps
      const since = Number(sp.get("since")) || 0;
      const fresh = since ? out.filter((b) => b.t >= since).slice(-500) : out.slice(-2);
      return NextResponse.json({ meta, bars: fresh });
    }

    const now = Date.now();
    const to = toParam ? Number(toParam) : null;

    if (tf.chunkDays === null) {
      if (to !== null) return NextResponse.json({ bars: [], more: false });
      const [{ bars }, meta] = await Promise.all([fetchChart({ symbol, interval: tf.yahoo, range: "max" }), fetchMeta(symbol)]);
      return NextResponse.json({ meta, bars, more: false });
    }

    const end = to ?? now;
    let start = end - tf.chunkDays * DAY_MS;
    if (tf.intraday) start = istDayStart(start);
    let more = true;
    if (tf.maxLookbackDays !== null) {
      const limit = istDayStart(now - tf.maxLookbackDays * DAY_MS) + DAY_MS;
      if (end <= limit) return NextResponse.json({ bars: [], more: false });
      if (start <= limit) {
        start = limit;
        more = false;
      }
    }

    const [{ meta: histMeta, bars }, meta] = await Promise.all([
      fetchChart({
        symbol,
        interval: tf.yahoo,
        period1: Math.floor(start / 1000),
        period2: Math.ceil((to ?? now + 60_000) / 1000),
      }),
      fetchMeta(symbol),
    ]);
    let out = tf.agg > 1 && tf.minutes ? aggregateIntraday(bars, tf.minutes) : bars;
    if (to !== null) out = out.filter((b) => b.t < to);
    if (out.length === 0 && to !== null) more = false;
    if (histMeta.firstTradeDate && start <= histMeta.firstTradeDate) more = false;
    return NextResponse.json({ meta, bars: out, more });
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 502;
    return NextResponse.json({ error: (err as Error).message || "Market data unavailable" }, { status });
  }
}
