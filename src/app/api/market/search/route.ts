import { NextResponse, type NextRequest } from "next/server";
import { searchSymbols } from "@/lib/yahoo";

// GET /api/market/search?q=hdfc
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 50);
  if (q.length < 1) return NextResponse.json([]);
  try {
    return NextResponse.json(await searchSymbols(q));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
