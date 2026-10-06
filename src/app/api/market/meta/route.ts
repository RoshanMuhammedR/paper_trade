import { NextResponse, type NextRequest } from "next/server";
import { fetchMeta, UpstreamError } from "@/lib/yahoo";
import { SYMBOL_RE } from "@/lib/market";

// GET /api/market/meta?symbol=RELIANCE.NS
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  try {
    return NextResponse.json(await fetchMeta(symbol));
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 502;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
