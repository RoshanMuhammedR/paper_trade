"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChartCandlestick, ChartLine, ShieldCheck, Wallet } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Input, Segmented, Spinner } from "@/components/ui/primitives";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = supabaseBrowser();
    const next = params.get("next") || "/trade";
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setNotice("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-line bg-panel lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-2 text-base font-semibold">
          <Logo /> PaperTrade
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Practice trading NSE stocks with live prices — risk free.
          </h1>
          <p className="mt-3 text-muted">
            Professional charts, real order types and a virtual ₹10 lakh portfolio that persists for as long as you want to trade.
          </p>
          <ul className="mt-8 space-y-4 text-[13px]">
            <Feature icon={<ChartCandlestick size={18} />} title="Pro charting" body="14 timeframes, 30+ indicators, drawing tools that save per symbol." />
            <Feature icon={<ChartLine size={18} />} title="Live NSE & BSE prices" body="Watchlists with real-time quotes and sparkline trends." />
            <Feature icon={<Wallet size={18} />} title="Realistic orders" body="Market, Limit, SL and SL-M with AMO, GTC and realistic charges." />
            <Feature icon={<ShieldCheck size={18} />} title="Track your progress" body="Holdings, realised P&L, equity curve and a full trade journal." />
          </ul>
        </div>
        <p className="text-xs text-faint">Prices from Yahoo Finance. For education only — not investment advice.</p>
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 text-base font-semibold lg:hidden">
            <Logo /> PaperTrade
          </div>
          <h2 className="text-xl font-semibold">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {mode === "signin" ? "Sign in to continue to your trading terminal." : "Start with ₹10,00,000 of virtual capital."}
          </p>

          <Segmented
            className="mt-6 w-full"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
            options={[
              { value: "signin", label: "Sign in" },
              { value: "signup", label: "Sign up" },
            ]}
          />

          <label className="mt-5 block text-xs font-medium text-muted">Email</label>
          <Input className="mt-1.5" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="mt-4 block text-xs font-medium text-muted">Password</label>
          <Input
            className="mt-1.5"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <div className="mt-4 rounded-md bg-down-soft px-3 py-2 text-xs text-down">{error}</div>}
          {notice && <div className="mt-4 rounded-md bg-up-soft px-3 py-2 text-xs text-up">{notice}</div>}

          <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={busy}>
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-muted">{body}</span>
      </span>
    </li>
  );
}
