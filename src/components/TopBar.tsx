"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Moon, Search, Settings, Sun, User } from "lucide-react";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { TICKER_INDICES, displaySymbol, isWithinSessionHours } from "@/lib/market";
import { fmtINR, fmtPct, fmtPrice, changeClass } from "@/lib/format";
import { openSearch, setActiveSymbol, setTheme, useApp } from "@/store/app";
import { Logo } from "./Logo";
import { IconButton, MenuItem, Popover, cn } from "./ui/primitives";

const NAV = [
  { href: "/trade", label: "Trade" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/orders", label: "Orders" },
];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useApp((s) => s.theme);
  const email = useApp((s) => s.email);
  const account = useApp((s) => s.account);
  const openCount = useApp((s) => s.orders.filter((o) => o.status === "OPEN" || o.status === "TRIGGERED").length);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <Link href="/trade" className="flex items-center gap-2 pr-1 text-[15px] font-semibold tracking-tight">
        <Logo size={22} />
        <span className="hidden sm:inline">PaperTrade</span>
      </Link>

      <nav className="flex items-center gap-0.5">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "relative flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium transition-colors",
              pathname.startsWith(n.href) ? "bg-hover text-fg" : "text-muted hover:text-fg",
            )}
          >
            {n.label}
            {n.href === "/orders" && openCount > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-white">{openCount}</span>
            )}
          </Link>
        ))}
      </nav>

      <IndexTicker />

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => openSearch("chart")}
          className="hidden h-8 w-56 items-center gap-2 rounded-md border border-line bg-panel-2 px-2.5 text-[13px] text-faint transition-colors hover:border-line-strong md:flex"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search symbols</span>
          <kbd className="rounded border border-line px-1 font-sans text-[10px]">Ctrl K</kbd>
        </button>
        <IconButton title="Search" className="md:hidden" onClick={() => openSearch("chart")}>
          <Search size={16} />
        </IconButton>

        <MarketStatus />

        {account && (
          <div className="hidden flex-col items-end px-2 leading-tight lg:flex">
            <span className="text-[10px] uppercase tracking-wide text-faint">Available</span>
            <span className="num text-[13px] font-semibold">{fmtINR(account.cash)}</span>
          </div>
        )}

        <IconButton title={theme === "dark" ? "Light theme" : "Dark theme"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>

        <Popover
          align="right"
          trigger={({ toggle }) => (
            <IconButton title="Account" onClick={toggle}>
              <User size={16} />
            </IconButton>
          )}
        >
          {(close) => (
            <>
              <div className="border-b border-line px-2 pb-2 pt-1">
                <div className="text-[11px] text-faint">Signed in as</div>
                <div className="truncate text-[13px] font-medium">{email}</div>
              </div>
              <div className="pt-1">
                <Link href="/settings" onClick={close}>
                  <MenuItem icon={<Settings size={14} />}>Settings</MenuItem>
                </Link>
                <MenuItem icon={<LogOut size={14} />} onClick={signOut} danger>
                  Sign out
                </MenuItem>
              </div>
            </>
          )}
        </Popover>
      </div>
    </header>
  );
}

function IndexTicker() {
  const quotes = useApp((s) => s.quotes);
  const router = useRouter();
  return (
    <div className="ml-2 hidden min-w-0 flex-1 items-center gap-4 overflow-hidden xl:flex">
      {TICKER_INDICES.map((sym) => {
        const q = quotes[sym];
        return (
          <button
            key={sym}
            onClick={() => {
              setActiveSymbol(sym);
              router.push("/trade");
            }}
            className="flex shrink-0 items-baseline gap-1.5 rounded px-1 text-xs transition-colors hover:bg-hover"
          >
            <span className="font-medium text-muted">{displaySymbol(sym)}</span>
            <span className="num font-semibold">{q ? fmtPrice(q.price) : "—"}</span>
            <span className={cn("num text-[11px]", changeClass(q?.change))}>{q ? fmtPct(q.changePct) : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function MarketStatus() {
  const meta = useApp((s) => s.activeMeta);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const open = meta ? meta.isOpen : isWithinSessionHours(now);
  return (
    <div
      className={cn(
        "hidden h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium sm:flex",
        open ? "bg-up-soft text-up" : "bg-hover text-muted",
      )}
      title={open ? "NSE regular session (09:15–15:30 IST)" : "Orders placed now are queued as AMO for the next session"}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", open ? "pulse-dot bg-up" : "bg-faint")} />
      {open ? "Market open" : "Market closed"}
    </div>
  );
}
