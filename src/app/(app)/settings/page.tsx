"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, RotateCcw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CHARGE_RATES } from "@/lib/charges";
import { fmtDate, fmtINR } from "@/lib/format";
import { setTheme, useApp } from "@/store/app";
import { resetAccount, setSimulateCharges } from "@/store/actions";
import { Button, Input, Modal, Segmented, Toggle, cn } from "@/components/ui/primitives";

const PRESETS = [100000, 500000, 1000000, 2500000, 10000000];

export default function SettingsPage() {
  const router = useRouter();
  const account = useApp((s) => s.account);
  const email = useApp((s) => s.email);
  const theme = useApp((s) => s.theme);
  const [resetOpen, setResetOpen] = useState(false);
  const [capital, setCapital] = useState(1000000);
  const [custom, setCustom] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const chosen = custom ? Number(custom) : capital;
  const validCapital = Number.isFinite(chosen) && chosen >= 10000 && chosen <= 1_000_000_000;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-[13px] text-muted">{email}</p>
        </div>

        <Section title="Account">
          <Row label="Starting capital" value={fmtINR(account?.starting_cash, { decimals: false })} />
          <Row label="Account opened" value={fmtDate(account?.created_at)} />
          <Row label="Last reset" value={fmtDate(account?.reset_at)} />
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <div className="text-[13px] font-medium">Reset paper account</div>
              <div className="text-xs text-muted">Deletes all orders, trades and holdings and starts over with fresh capital.</div>
            </div>
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              <RotateCcw size={14} /> Reset
            </Button>
          </div>
        </Section>

        <Section title="Trading">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <div className="text-[13px] font-medium">Simulate brokerage &amp; taxes</div>
              <div className="text-xs text-muted">Deduct realistic NSE delivery charges on every execution.</div>
            </div>
            <Toggle checked={account?.simulate_charges ?? true} onChange={(v) => void setSimulateCharges(v)} label="Simulate charges" />
          </div>
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-panel-2 p-3 text-xs text-muted sm:grid-cols-3">
              <span>Brokerage: ₹0</span>
              <span>STT: {(CHARGE_RATES.stt * 100).toFixed(2)}% buy &amp; sell</span>
              <span>Exchange: {(CHARGE_RATES.exchange * 100).toFixed(5)}%</span>
              <span>SEBI: ₹10 / crore</span>
              <span>Stamp duty: {(CHARGE_RATES.stampBuy * 100).toFixed(3)}% on buy</span>
              <span>GST: 18% on fees</span>
              <span>DP: ₹{CHARGE_RATES.dpPerSell} per sell</span>
            </div>
          </div>
          <div className="border-t border-line px-4 py-3 text-xs text-muted">
            <div className="mb-1 text-[13px] font-medium text-fg">How orders execute</div>
            <ul className="list-disc space-y-1 pl-4">
              <li>During market hours (09:15–15:30 IST) market orders fill instantly at the live price.</li>
              <li>Limit, SL and SL-M orders fill when real prices cross your level — checked against 1-minute candles, so fills are accurate even if the app was closed.</li>
              <li>Orders placed outside market hours are after-market orders (AMO) and execute from the next session&apos;s open.</li>
              <li>Day orders expire at 15:30 IST; GTC orders stay active for up to a year.</li>
            </ul>
          </div>
        </Section>

        <Section title="Appearance">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] font-medium">Theme</span>
            <Segmented
              value={theme}
              onChange={setTheme}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
            />
          </div>
        </Section>

        <Section title="About">
          <div className="space-y-1 px-4 py-3 text-xs text-muted">
            <p>Prices are sourced from Yahoo Finance and may differ slightly from exchange feeds. This is a simulator for learning — not investment advice.</p>
          </div>
          <div className="flex justify-end border-t border-line px-4 py-3">
            <Button
              variant="outline"
              onClick={async () => {
                await supabaseBrowser().auth.signOut();
                router.replace("/login");
                router.refresh();
              }}
            >
              <LogOut size={14} /> Sign out
            </Button>
          </div>
        </Section>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset paper account"
        width={440}
        footer={
          <>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="sell"
              disabled={busy || !validCapital || confirmText !== "RESET"}
              onClick={async () => {
                setBusy(true);
                const ok = await resetAccount(chosen);
                setBusy(false);
                if (ok) {
                  setResetOpen(false);
                  setConfirmText("");
                }
              }}
            >
              Reset account
            </Button>
          </>
        }
      >
        <div className="space-y-4 p-4">
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Starting capital</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setCapital(p);
                    setCustom("");
                  }}
                  className={cn(
                    "h-8 rounded-md border px-3 text-[13px] font-medium",
                    !custom && capital === p ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-hover",
                  )}
                >
                  {fmtINR(p, { decimals: false })}
                </button>
              ))}
            </div>
            <Input className="mt-2" type="number" placeholder="Custom amount (₹10,000 – ₹100 crore)" value={custom} onChange={(e) => setCustom(e.target.value)} />
          </div>
          <div className="rounded-md bg-down-soft px-3 py-2 text-xs text-down">
            This permanently deletes your orders, trades, holdings and equity history.
          </div>
          <div>
            <div className="mb-1.5 text-xs text-muted">
              Type <span className="font-mono font-semibold text-fg">RESET</span> to confirm
            </div>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}
