import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { OrderError, parseOrderInput, placeOrder } from "@/lib/engine";

// POST /api/orders — place an order
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const input = parseOrderInput(await req.json());
    const order = await placeOrder(auth.supabase, input);
    return NextResponse.json(order);
  } catch (err) {
    const status = err instanceof OrderError ? 400 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
