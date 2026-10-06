import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { fillIfMarketable } from "@/lib/engine";
import type { Order } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const num = (v: unknown) => (v == null || v === "" ? null : Math.round(Number(v) * 100) / 100);

// PATCH /api/orders/:id — modify qty / prices of an open order
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { data, error } = await auth.supabase.rpc("pt_modify_order", {
    p_order_id: id,
    p_qty: Number(body.qty),
    p_limit_price: num(body.limitPrice),
    p_trigger_price: num(body.triggerPrice),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  try {
    return NextResponse.json(await fillIfMarketable(auth.supabase, data as Order));
  } catch {
    return NextResponse.json(data);
  }
}

// DELETE /api/orders/:id — cancel
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("pt_cancel_order", { p_order_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
