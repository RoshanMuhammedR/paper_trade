import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { reconcile, snapshotEquity } from "@/lib/engine";

// POST /api/sync — fill/expire pending orders against real prices and record equity
export async function POST() {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const events = await reconcile(auth.supabase);
    const snap = await snapshotEquity(auth.supabase).catch(() => null);
    return NextResponse.json({ events, equity: snap?.equity ?? null });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
