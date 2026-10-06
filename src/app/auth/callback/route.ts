import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Handles email-confirmation / magic-link redirects
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/trade";
  if (code) {
    const supabase = await supabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/trade";
  return NextResponse.redirect(new URL(safeNext, req.url));
}
