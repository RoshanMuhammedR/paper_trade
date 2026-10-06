import { NextResponse, type NextRequest } from "next/server";
import { fetchQuotes } from "@/lib/yahoo";
import { SYMBOL_RE } from "@/lib/market";

// GET /api/market/quotes?symbols=RELIANCE.NS,TCS.NS
export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s));
  if (symbols.length === 0) return NextResponse.json([]);
  try {
    return NextResponse.json(await fetchQuotes(symbols));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
